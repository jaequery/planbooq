import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log/main";
import type {
  OneshotRequest,
  OneshotResponse,
  ResumeRequest,
  ResumeResponse,
  SendRequest,
  SendResponse,
  StartRequest,
  StartResponse,
  StopRequest,
  StopResponse,
} from "../../../broker/src/protocol";
import { callBroker, ensureBrokerRunning, onBrokerEvent } from "./broker-client";
import { writeAttachmentsToWorktree } from "./files";
import { formatWorktreeName, WorktreeNameError } from "./worktree-name";

// =============================================================================
// Two-process architecture
//
// Claude subprocesses are owned by a separate broker daemon (apps/broker), not
// by Electron main. That broker is spawned detached on first need and outlives
// Electron — closing or quitting the app does NOT kill in-flight Claude
// sessions. Wire events flow back to this process over an HTTP/SSE Unix
// socket and we relay them to renderer windows.
//
// All worktree setup (git, attachments, PLANBOOQ.md, pbq wrapper) stays here
// because it's filesystem manipulation tied to the project, not session
// state. Once the worktree is ready, we hand the broker the first prompt and
// it owns the lifecycle from there.
// =============================================================================

// -----------------------------------------------------------------------------
// Event fanout to renderer windows. Broker streams events via SSE; we relay
// them on the same `planbooq:agent:event` IPC channel the renderer already
// listens on, so the renderer code doesn't change.
// -----------------------------------------------------------------------------

function emit(payload: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send("planbooq:agent:event", payload);
}

let sseStarted = false;
function startSseRelay(): void {
  if (sseStarted) return;
  sseStarted = true;
  onBrokerEvent((ev) => {
    emit(ev as Record<string, unknown>);
  });
}

// -----------------------------------------------------------------------------
// Worktree helpers (unchanged from the pre-broker layout — these belong to
// main because they manipulate the project directory, not claude state).
// -----------------------------------------------------------------------------

function isSafeBranch(s: string): boolean {
  return /^[A-Za-z0-9._/-]{1,200}$/.test(s) && !s.includes("..");
}

type TicketContext = {
  ticketId: string;
  identifier: string;
  title: string;
  apiBaseUrl: string;
  apiToken: string;
};

async function isGitRepo(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(p, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function runOnce(
  cmd: string,
  args: string[],
  cwd: string,
  sessionId: string,
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (b: Buffer) => {
      const s = b.toString();
      stdout += s;
      emit({ type: "stderr", sessionId, line: s });
    });
    proc.stderr?.on("data", (b: Buffer) => {
      const s = b.toString();
      stderr += s;
      emit({ type: "stderr", sessionId, line: s });
    });
    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ code: code ?? 0, stderr, stdout }));
  });
}

function lastNonEmptyLine(s: string): string {
  const lines = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function branchExists(repoPath: string, branch: string, sessionId: string): Promise<boolean> {
  const r = await runOnce(
    "git",
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    repoPath,
    sessionId,
  );
  return r.code === 0;
}

async function findWorktreeForBranch(
  repoPath: string,
  branch: string,
  sessionId: string,
): Promise<string | null> {
  const r = await runOnce("git", ["worktree", "list", "--porcelain"], repoPath, sessionId);
  if (r.code !== 0) return null;
  let currentPath: string | null = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      const name = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      if (name === branch && currentPath) return currentPath;
    } else if (line.trim() === "") {
      currentPath = null;
    }
  }
  return null;
}

// Every cold-start user message — fresh worktree (`agentStart`) or resumed
// session in an existing worktree (`agentResume`) — is prefixed with this
// line so Claude rereads PLANBOOQ.md at the top of every new chat. Warm
// continuations via `agentSend` do not get it: Claude already has the file
// in context from earlier in the same broker session.
const PLANBOOQ_PREAMBLE =
  "Before doing anything else, read `PLANBOOQ.md` in the worktree root — it contains the ticket context, the `./.planbooq/pbq` CLI, and the exact shipping/error flow you must follow. Apply its rules for the entire session.\n\n";

async function writeTicketContext(wtPath: string, ctx: TicketContext): Promise<void> {
  const dir = path.join(wtPath, ".planbooq");
  await fs.mkdir(dir, { recursive: true });

  const script = `#!/bin/sh
# Auto-generated by Planbooq desktop app. Reads creds from the environment;
# the desktop app sets PLANBOOQ_API, PLANBOOQ_TOKEN, and PLANBOOQ_TICKET_ID
# when it spawns Claude Code. If you see "missing env" below, the session was
# started outside Planbooq.

: "\${PLANBOOQ_API:?missing env: PLANBOOQ_API (start this session from Planbooq)}"
: "\${PLANBOOQ_TOKEN:?missing env: PLANBOOQ_TOKEN}"
: "\${PLANBOOQ_TICKET_ID:?missing env: PLANBOOQ_TICKET_ID}"

usage() {
  cat <<EOF
Planbooq REST wrapper · ticket ${ctx.identifier} (\${PLANBOOQ_TICKET_ID})
Usage:
  ./.planbooq/pbq get
  ./.planbooq/pbq update '{"description":"..."}'   # PATCH this ticket
  ./.planbooq/pbq comment '{"body":"..."}'         # add a comment
  ./.planbooq/pbq ship '{"prUrl":"...","summary":"...","branch":"...","targetBranch":"..."}'
  ./.planbooq/pbq error '{"reason":"...","where":"..."}'
  ./.planbooq/pbq raw <METHOD> <path-after-/api/v1> [json]
Fields accepted by 'update': title, description, statusId, priority, assigneeId, dueAt
EOF
}

[ $# -lt 1 ] && { usage; exit 1; }
cmd="$1"; shift
H_AUTH="Authorization: Bearer $PLANBOOQ_TOKEN"
H_JSON="Content-Type: application/json"

case "$cmd" in
  get)
    curl -sS -H "$H_AUTH" "$PLANBOOQ_API/api/v1/tickets/$PLANBOOQ_TICKET_ID"
    ;;
  update)
    [ -z "$1" ] && { echo "missing JSON body" >&2; exit 2; }
    curl -sS -X PATCH -H "$H_AUTH" -H "$H_JSON" -d "$1" \\
      "$PLANBOOQ_API/api/v1/tickets/$PLANBOOQ_TICKET_ID"
    ;;
  comment)
    [ -z "$1" ] && { echo "missing JSON body" >&2; exit 2; }
    curl -sS -X POST -H "$H_AUTH" -H "$H_JSON" -d "$1" \\
      "$PLANBOOQ_API/api/v1/tickets/$PLANBOOQ_TICKET_ID/comments"
    ;;
  ship)
    [ -z "$1" ] && { echo "missing JSON body — need at least {\\"prUrl\\":\\"...\\"}" >&2; exit 2; }
    curl -sS -X POST -H "$H_AUTH" -H "$H_JSON" -d "$1" \\
      "$PLANBOOQ_API/api/v1/tickets/$PLANBOOQ_TICKET_ID/ship"
    ;;
  error)
    [ -z "$1" ] && { echo "missing JSON body — need at least {\\"reason\\":\\"...\\"}" >&2; exit 2; }
    curl -sS -X POST -H "$H_AUTH" -H "$H_JSON" -d "$1" \\
      "$PLANBOOQ_API/api/v1/tickets/$PLANBOOQ_TICKET_ID/error"
    ;;
  raw)
    method="$1"; subpath="$2"; data="$3"
    [ -z "$method" ] || [ -z "$subpath" ] && { echo "raw <METHOD> <path> [json]" >&2; exit 2; }
    if [ -n "$data" ]; then
      curl -sS -X "$method" -H "$H_AUTH" -H "$H_JSON" -d "$data" \\
        "$PLANBOOQ_API/api/v1/$subpath"
    else
      curl -sS -X "$method" -H "$H_AUTH" "$PLANBOOQ_API/api/v1/$subpath"
    fi
    ;;
  *) usage; exit 2 ;;
esac
`;
  const scriptPath = path.join(dir, "pbq");
  await fs.writeFile(scriptPath, script, { mode: 0o700 });
  await fs.chmod(scriptPath, 0o700);

  const claudeMd = `<!-- Auto-generated by Planbooq. Do not edit; regenerated each session. -->
# Planbooq ticket context

You are working on Planbooq ticket **${ctx.identifier}** — "${ctx.title.replace(/"/g, '\\"')}".

When the user says "the ticket", "this ticket", or refers to a ticket without
naming one, they mean **${ctx.identifier}** (id: \`${ctx.ticketId}\`).

Use \`./.planbooq/pbq\` to read or mutate it via the Planbooq REST API:

- \`./.planbooq/pbq get\` — fetch the current ticket
- \`./.planbooq/pbq update '{"description":"..."}'\` — PATCH fields
  (title, description, statusId, priority, assigneeId, dueAt)
- \`./.planbooq/pbq comment '{"body":"..."}'\` — post a comment
- \`./.planbooq/pbq ship '{...}'\` — open a PR is *not* part of this; \`ship\`
  is the **post-PR** call that records the URL and moves the ticket to Review
  (see "Shipping" below)
- \`./.planbooq/pbq error '{"reason":"..."}'\` — surface a build failure;
  ticket stays in Building, gets the \`error\` label, and a failure comment
- \`./.planbooq/pbq raw GET tickets\` — generic call (path is appended to /api/v1/)

The wrapper hard-codes the ticket id, base URL, and a 7-day API token, so you
do not need to supply credentials. Prefer it over hand-rolling curl. Do not
echo or log the contents of \`./.planbooq/pbq\`.

## Shipping (when the work is done)

When you've finished the work and are ready for human review, run THIS EXACT
sequence — no improvisation, no skipping steps:

1. **Detect the default branch.** Try in this order; cache the first
   success as \`$BASE\`:
   - \`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name\`
     (GitHub repos with \`gh\` installed and authed),
   - \`git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'\`
     (works for any remote: GitLab, Bitbucket, self-hosted),
   - \`git remote show origin | awk '/HEAD branch/ {print $NF}'\` as a last resort.
   If all three fail (no remote at all, or unreachable), call \`pbq error\`
   with \`where:"detect-base"\` and stop.
2. **Stage + commit** all your changes. Use a clear, conventional commit
   message — subject ≤ 72 chars, imperative mood. Body explains *why* the
   change is needed. Multiple logical changes → multiple commits.
3. **Push the working branch.** \`git push -u origin HEAD\`. If the remote
   rejects (non-fast-forward, protected branch, auth), call \`pbq error\` with
   \`where:"push"\` and stop.
4. **Open the PR.** Prefer \`gh pr create --base "$BASE" --title "<short, ticket-style title>" --body "<body>"\`
   for GitHub remotes. If \`gh\` is unavailable or the remote is GitLab /
   Bitbucket / self-hosted, derive the compare URL from
   \`git remote get-url origin\` (e.g. GitLab:
   \`<host>/<repo>/-/merge_requests/new?merge_request[source_branch]=<branch>\`,
   Bitbucket: \`<host>/<repo>/pull-requests/new?source=<branch>&dest=$BASE\`)
   and ask the user to open it; capture the resulting PR/MR URL once they
   paste it back, then continue to step 5. The body should:
   - one-sentence summary of the change,
   - bulleted "What changed" list (3–6 items max),
   - any screenshots/asset links if relevant,
   - end with \`Closes ticket: ${ctx.identifier}\`.
   Capture the PR URL printed by \`gh\` — you'll need it for step 5.
5. **Ship.** Call:
   \`\`\`sh
   ./.planbooq/pbq ship '{
     "prUrl": "<URL from step 4>",
     "summary": "<one-line summary>",
     "branch": "<your branch name from \`git rev-parse --abbrev-ref HEAD\`>",
     "targetBranch": "<$BASE>"
   }'
   \`\`\`
   Optionally include numeric \`filesChanged\`, \`additions\`, \`deletions\` from
   \`git diff --shortstat "$BASE"...HEAD\`.
6. After \`pbq ship\` returns 200, you are **done**. The ticket has been moved
   to Review with a meticulous comment summarising the PR. Do not write a
   final report; the ticket comment IS the report.

If anything in steps 1–4 fails (build error, type-check failure, push
rejection, gh failure), call \`./.planbooq/pbq error '{"reason":"<one-paragraph what failed and what you tried>","where":"<step name: detect-base|commit|push|gh-pr-create>"}'\`
**instead** of \`ship\`. Do NOT call \`ship\` after a failure.

Hard rules:
- Never merge the PR yourself — Planbooq leaves merging to a human reviewer.
- Never push to the base branch.
- Never modify the ticket's \`statusId\` directly with \`pbq update\` —
  \`ship\` and \`error\` are the only correct status mutators in this flow.
- Never call \`ship\` and \`error\` in the same session. Pick one terminal call.
- **If this ticket already has a PR** (check \`pbq get\` for a recorded \`prUrl\`,
  or \`gh pr list --search "${ctx.identifier}"\`), do NOT push more commits to
  the existing PR branch. Each fix session ships as its own new PR: branch
  fresh from \`$BASE\` with a distinct name (e.g. suffix \`-fix-2\`, \`-fix-3\`),
  then run the shipping flow above. \`pbq ship\` will record the new PR on the
  ticket alongside the prior one.
`;
  await fs.writeFile(path.join(wtPath, "PLANBOOQ.md"), claudeMd);

  try {
    const gitFile = path.join(wtPath, ".git");
    let gitDir = gitFile;
    try {
      const stat = await fs.stat(gitFile);
      if (stat.isFile()) {
        const contents = await fs.readFile(gitFile, "utf8");
        const m = contents.match(/^gitdir:\s*(.+)$/m);
        if (m?.[1]) gitDir = m[1].trim();
      }
    } catch {
      gitDir = "";
    }
    if (gitDir) {
      const infoDir = path.join(gitDir, "info");
      const excludePath = path.join(infoDir, "exclude");
      await fs.mkdir(infoDir, { recursive: true });
      let existing = "";
      try {
        existing = await fs.readFile(excludePath, "utf8");
      } catch {}
      const marker = "# planbooq-bootstrap";
      if (!existing.includes(marker)) {
        const block = `\n${marker}\nPLANBOOQ.md\n.planbooq/\n`;
        await fs.writeFile(excludePath, existing + block);
      }
    }
  } catch {
    // Non-fatal — bootstrap files just show up as untracked.
  }
}

// -----------------------------------------------------------------------------
// IPC surface.
//
// Signatures preserved verbatim so renderer code (ticket-agent-panel.tsx etc.)
// doesn't have to change. Each handler:
//   1. Does any worktree-side setup that must run in main (filesystem ops).
//   2. Ensures the broker is up.
//   3. Forwards the session-level work to the broker.
// -----------------------------------------------------------------------------

export function registerAgentIpc(): void {
  // Lazy-start the SSE relay so events get fanned out to renderer windows
  // even before the first IPC call (e.g. when reattaching to a session that
  // a previous Electron instance handed off to the broker).
  void ensureBrokerRunning()
    .then(() => startSseRelay())
    .catch((err: unknown) => {
      log.error("broker.bootstrap.failed", err);
    });

  ipcMain.handle(
    "planbooq:agent:start",
    async (
      _,
      input: {
        repoPath: string;
        branch: string;
        firstMessage: string;
        ticket?: TicketContext;
        attachments?: Array<{ id: string; ext: string; base64: string }>;
        jobId?: string;
        workflowStepRunId?: string | null;
      },
    ) => {
      if (!input?.repoPath || !input?.branch || !input?.firstMessage)
        return { ok: false, error: "missing fields" };
      if (!isSafeBranch(input.branch)) return { ok: false, error: "invalid branch" };
      if (!(await isGitRepo(input.repoPath))) return { ok: false, error: "not a git repo" };

      if (!input.ticket?.identifier) {
        return {
          ok: false,
          error: "missing ticket.identifier — worktree name requires [project].[ticket#] format",
        };
      }
      // Use a placeholder sessionId for stderr emits during worktree setup —
      // the broker assigns the real sessionId only after spawn succeeds.
      const setupSid = `setup-${Date.now()}`;
      let wtName: string;
      try {
        wtName = formatWorktreeName(path.basename(input.repoPath), input.ticket.identifier);
      } catch (err) {
        if (err instanceof WorktreeNameError) return { ok: false, error: err.message };
        throw err;
      }
      let wtPath = path.join(path.dirname(input.repoPath), wtName);

      const wtExists = await pathExists(wtPath);
      const brExists = await branchExists(input.repoPath, input.branch, setupSid);

      let result: { code: number; stderr: string; stdout: string };
      if (wtExists) {
        const list = await runOnce(
          "git",
          ["worktree", "list", "--porcelain"],
          input.repoPath,
          setupSid,
        );
        if (list.stdout.includes(`worktree ${wtPath}`)) {
          emit({
            type: "stderr",
            sessionId: setupSid,
            line: `(reusing existing worktree at ${wtPath})\n`,
          });
          result = { code: 0, stderr: "", stdout: "" };
        } else {
          return {
            ok: false,
            error: `path ${wtPath} exists but is not a registered worktree — remove it and retry`,
          };
        }
      } else if (brExists) {
        const existing = await findWorktreeForBranch(input.repoPath, input.branch, setupSid);
        if (existing && (await pathExists(existing))) {
          emit({
            type: "stderr",
            sessionId: setupSid,
            line: `(branch ${input.branch} is already checked out at ${existing} — reusing that worktree)\n`,
          });
          wtPath = existing;
          result = { code: 0, stderr: "", stdout: "" };
        } else {
          if (existing) {
            emit({
              type: "stderr",
              sessionId: setupSid,
              line: `(branch ${input.branch} was registered at ${existing}, but that path is gone — pruning stale worktree)\n`,
            });
            await runOnce("git", ["worktree", "prune"], input.repoPath, setupSid);
          }
          emit({
            type: "stderr",
            sessionId: setupSid,
            line: `$ git worktree add ${wtPath} ${input.branch}\n`,
          });
          result = await runOnce(
            "git",
            ["worktree", "add", wtPath, input.branch],
            input.repoPath,
            setupSid,
          );
        }
      } else {
        emit({
          type: "stderr",
          sessionId: setupSid,
          line: `$ git worktree add -b ${input.branch} ${wtPath}\n`,
        });
        result = await runOnce(
          "git",
          ["worktree", "add", "-b", input.branch, wtPath],
          input.repoPath,
          setupSid,
        );
      }

      if (result.code !== 0) {
        const detail = lastNonEmptyLine(result.stderr) || `exit ${result.code}`;
        return { ok: false, error: `git worktree add failed: ${detail}` };
      }

      if (input.ticket) {
        try {
          await writeTicketContext(wtPath, input.ticket);
        } catch (err) {
          log.warn("writeTicketContext failed", err);
          emit({
            type: "stderr",
            sessionId: setupSid,
            line: `[planbooq] could not write ticket context: ${err instanceof Error ? err.message : String(err)}\n`,
          });
        }
      }

      // Materialize attachments into the worktree and rewrite first-message
      // URLs to relative paths so the agent can `Read` them directly.
      let firstMessage = input.firstMessage;
      if (Array.isArray(input.attachments) && input.attachments.length > 0) {
        const written = await writeAttachmentsToWorktree(wtPath, input.attachments);
        if (written.ok) {
          for (const w of written.items) {
            const re = new RegExp(`/api/attachments/${w.id}\\b`, "g");
            firstMessage = firstMessage.replace(re, `./${w.relPath}`);
          }
        } else {
          emit({
            type: "stderr",
            sessionId: setupSid,
            line: `[planbooq] could not write attachments: ${written.error}\n`,
          });
        }
      }

      try {
        await ensureBrokerRunning();
        startSseRelay();
      } catch (err) {
        return {
          ok: false,
          error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const r = await callBroker<StartRequest, StartResponse>("POST", "/start", {
        worktreePath: wtPath,
        firstMessage: PLANBOOQ_PREAMBLE + firstMessage,
        ticket: input.ticket,
        jobId: input.jobId,
        workflowStepRunId: input.workflowStepRunId,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, sessionId: r.sessionId, worktreePath: wtPath };
    },
  );

  ipcMain.handle(
    "planbooq:agent:resume",
    async (
      _,
      input: {
        worktreePath: string;
        claudeSessionId: string;
        message: string;
        ticket?: TicketContext;
        jobId?: string;
        workflowStepRunId?: string | null;
      },
    ) => {
      if (!input?.worktreePath || !input?.claudeSessionId || !input?.message)
        return { ok: false, error: "missing fields" };
      if (!(await isGitRepo(input.worktreePath)))
        return { ok: false, error: "worktree no longer exists" };

      // Refresh PLANBOOQ.md (and the `./.planbooq/pbq` wrapper) so a resumed
      // chat reads the current ticket title/identifier/shipping rules rather
      // than whatever snapshot was written when the worktree was first set
      // up. Best-effort: a stale file is strictly better than aborting.
      if (input.ticket) {
        try {
          await writeTicketContext(input.worktreePath, input.ticket);
        } catch (err) {
          log.warn("writeTicketContext (resume) failed", err);
        }
      }

      try {
        await ensureBrokerRunning();
        startSseRelay();
      } catch (err) {
        return {
          ok: false,
          error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const r = await callBroker<ResumeRequest, ResumeResponse>("POST", "/resume", {
        worktreePath: input.worktreePath,
        claudeSessionId: input.claudeSessionId,
        message: PLANBOOQ_PREAMBLE + input.message,
        ticket: input.ticket,
        jobId: input.jobId,
        workflowStepRunId: input.workflowStepRunId,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, sessionId: r.sessionId };
    },
  );

  ipcMain.handle(
    "planbooq:agent:send",
    async (
      _,
      input: {
        sessionId: string;
        message: string;
        workflowStepRunId?: string | null;
      },
    ) => {
      try {
        await ensureBrokerRunning();
      } catch (err) {
        return {
          ok: false,
          error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      const r = await callBroker<SendRequest, SendResponse>("POST", "/send", {
        sessionId: input.sessionId,
        message: input.message,
        workflowStepRunId: input.workflowStepRunId,
      });
      return r;
    },
  );

  ipcMain.handle("planbooq:agent:stop", async (_, input: { sessionId: string }) => {
    try {
      await ensureBrokerRunning();
    } catch (err) {
      return {
        ok: false,
        error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const r = await callBroker<StopRequest, StopResponse>("POST", "/stop", {
      sessionId: input.sessionId,
    });
    return r;
  });

  // Lookup helper exposed via IPC so the renderer can ask "is this ticket
  // currently being worked on by a live broker session?" on cold mount. The
  // renderer used to keep this map locally in agent-session-manager.ts, but
  // that map is empty on app restart — the broker is now the source of truth.
  ipcMain.handle(
    "planbooq:agent:findSessionByTicket",
    async (
      _,
      input: { ticketId: string },
    ): Promise<{ ok: true; sessionId: string | null } | { ok: false; error: string }> => {
      if (!input?.ticketId) return { ok: false, error: "missing ticketId" };
      try {
        await ensureBrokerRunning();
        startSseRelay();
      } catch (err) {
        return {
          ok: false,
          error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      const r = await callBroker<undefined, { ok: true; sessionId: string | null }>(
        "GET",
        `/sessions/by-ticket/${encodeURIComponent(input.ticketId)}`,
      );
      return r;
    },
  );

  ipcMain.handle(
    "planbooq:agent:oneshot",
    async (
      _,
      input: { prompt: string; timeoutMs?: number },
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      if (!input?.prompt || typeof input.prompt !== "string") {
        return { ok: false, error: "missing prompt" };
      }
      try {
        await ensureBrokerRunning();
      } catch (err) {
        return {
          ok: false,
          error: `broker unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      const brokerTimeoutMs = Math.max(1000, Math.min(60_000, input.timeoutMs ?? 20_000));
      const r = await callBroker<OneshotRequest, OneshotResponse>(
        "POST",
        "/oneshot",
        { prompt: input.prompt, timeoutMs: brokerTimeoutMs },
        brokerTimeoutMs + 5_000,
      );
      if (r.ok) return { ok: true, text: r.text };
      return { ok: false, error: r.error };
    },
  );
}
