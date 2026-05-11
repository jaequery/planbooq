import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log/main";
import { writeAttachmentsToWorktree } from "./files";
import { formatWorktreeName, WorktreeNameError } from "./worktree-name";

// =============================================================================
// Per-session wire log
//
// Writes every stdout/stderr line, every heartbeat fire, and every lifecycle
// event for a given session to ~/.planbooq/agent-logs/<sessionId>.log. The
// file is the source of truth when a session freezes — wire events written
// in real time as they come off claude's stdout, so the timestamp on the last
// line tells us exactly when claude went silent and what it was doing.
//
// Fire-and-forget: a write failure logs to electron-log and is swallowed.
// The agent session must never break because logging hiccuped.
// =============================================================================

const AGENT_LOG_DIR = path.join(os.homedir(), ".planbooq", "agent-logs");
const logStreams = new Map<string, WriteStream>();

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(AGENT_LOG_DIR, { recursive: true });
  } catch (err) {
    log.warn("agent-log.mkdir.failed", err);
  }
}

function logPathFor(sessionId: string): string {
  return path.join(AGENT_LOG_DIR, `${sessionId}.log`);
}

function openLogStream(sessionId: string): WriteStream | null {
  const cached = logStreams.get(sessionId);
  if (cached) return cached;
  try {
    const stream = createWriteStream(logPathFor(sessionId), { flags: "a" });
    stream.on("error", (err) =>
      log.warn("agent-log.stream.error", { sessionId, err: err.message }),
    );
    logStreams.set(sessionId, stream);
    return stream;
  } catch (err) {
    log.warn("agent-log.open.failed", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function logLine(
  sessionId: string,
  kind: string,
  payload?: Record<string, unknown> | string,
): void {
  const stream = openLogStream(sessionId);
  if (!stream) return;
  const ts = new Date().toISOString();
  let line: string;
  if (typeof payload === "string") {
    // Inline content, preserve as-is but strip trailing newlines so the file
    // stays one-record-per-line.
    line = `${ts}\t${kind}\t${payload.replace(/\n+$/, "")}\n`;
  } else if (payload) {
    line = `${ts}\t${kind}\t${JSON.stringify(payload)}\n`;
  } else {
    line = `${ts}\t${kind}\n`;
  }
  // write returns false when the buffer is full — we don't backpressure
  // because logging stalling the bridge is worse than dropping log lines.
  stream.write(line);
}

function closeLogStream(sessionId: string): void {
  const stream = logStreams.get(sessionId);
  if (!stream) return;
  logStreams.delete(sessionId);
  try {
    stream.end();
  } catch {}
}

// Ensure the dir exists at module load — most spawn calls will fire before
// we'd otherwise create it lazily on first write, which avoids a missed
// initial line if mkdir is slow.
void ensureLogDir();

type Session = {
  proc: ChildProcess;
  cwd: string;
  // Heartbeat plumbing — populated when the renderer hands us a jobId at
  // start/resume time. Main is the authoritative spawner of the `claude`
  // child, so it owns the liveness signal: every HEARTBEAT_MS we PATCH the
  // server, bumping AgentJob.updatedAt to confirm "the bridge has eyes on a
  // live child." If main quits (Electron app closed) or the child exits,
  // heartbeats stop and the server reaper marks the row FAILED.
  // Mirrors Paperclip's spawn-side liveness check
  // (~/Sites/paperclip/server/src/services/heartbeat.ts:6406), adapted to
  // Planbooq's two-process architecture: we can't process.kill(pid,0) from
  // the Next.js server because it doesn't own the handle, so the owner
  // (Electron main) pushes the signal instead.
  jobId: string | null;
  apiBaseUrl: string | null;
  apiToken: string | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  // Wire-event PATCH plumbing. Main is the spawner that owns the `claude`
  // child handle, so it's also the only process that can guarantee every
  // wire line lands on the server — the renderer can unmount mid-session,
  // miss the first events before registerAgentSession runs, or get cleared
  // by fast-refresh. We collect stdout/stderr lines here, coalesce them on
  // a 250ms timer, and PATCH /api/desktop-jobs/:jobId. The renderer keeps
  // its IPC subscription for live UI rendering — it's no longer in the
  // critical path for persistence.
  appendBuffer: string;
  appendTimer: ReturnType<typeof setTimeout> | null;
  // Set true by `planbooq:agent:stop` BEFORE the kill so the imminent
  // `exit` event is classified as CANCELED (user intent) rather than
  // FAILED (crash/OOM). Mirrors the renderer's previous `stoppedByUser`
  // set — now lives on the session because main owns the exit PATCH.
  userStopped: boolean;
  // Set once main has dispatched a terminal PATCH for this session so
  // any straggling exit/error from the child doesn't re-fire it.
  terminalSent: boolean;
};

const sessions = new Map<string, Session>();

const HEARTBEAT_MS = 30_000;

function clearHeartbeat(session: Session): void {
  if (session.heartbeatTimer) {
    clearInterval(session.heartbeatTimer);
    session.heartbeatTimer = null;
  }
}

function startHeartbeat(session: Session, sessionId: string): void {
  if (!session.jobId || !session.apiBaseUrl || !session.apiToken) return;
  clearHeartbeat(session);
  const jobId = session.jobId;
  const url = `${session.apiBaseUrl}/api/desktop-jobs/${jobId}`;
  const token = session.apiToken;
  const tick = (): void => {
    // Fire-and-forget. Server route returns immediately for heartbeat-only
    // PATCH; failures (network blip, auth expiry) are non-fatal — the reaper
    // will catch the row if heartbeats truly stop.
    const startedAt = Date.now();
    void fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ heartbeat: true }),
    })
      .then((res) => {
        logLine(sessionId, "heartbeat", {
          jobId,
          ok: res.ok,
          status: res.status,
          ms: Date.now() - startedAt,
        });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn("planbooq.heartbeat.failed", { sessionId, jobId, error: msg });
        logLine(sessionId, "heartbeat", {
          jobId,
          ok: false,
          error: msg,
          ms: Date.now() - startedAt,
        });
      });
  };
  // First tick immediately to close the window between session start and
  // the first scheduled tick (otherwise updatedAt could go stale before any
  // heartbeat lands).
  tick();
  session.heartbeatTimer = setInterval(tick, HEARTBEAT_MS);
  logLine(sessionId, "heartbeat-start", { jobId, intervalMs: HEARTBEAT_MS });
}

function attachHeartbeatTarget(
  sessionId: string,
  jobId: string,
  apiBaseUrl: string,
  apiToken: string,
): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.jobId = jobId;
  s.apiBaseUrl = apiBaseUrl;
  s.apiToken = apiToken;
  // Token redacted in the log — the apiBaseUrl is plenty to correlate
  // heartbeat targets when reading the file.
  logLine(sessionId, "attach", { jobId, apiBaseUrl });
  startHeartbeat(s, sessionId);
}

// =============================================================================
// Wire-event PATCH plumbing (spawner-side persistence).
//
// Every stdout/stderr line and the exit event get PATCHed to
// /api/desktop-jobs/:jobId from THIS process — main, the owner of the
// `claude` child handle. Lines are coalesced on a 250ms timer so a chatty
// child doesn't issue 10+ PATCH/sec. The exit PATCH is atomic: pending
// buffer + exit marker + terminal status + exitCode in a single request,
// so the row never lands in a "saw exit but not status" intermediate.
// =============================================================================

type WireEvent =
  | { kind: "agent"; line: string; at?: number }
  | { kind: "stderr"; line: string; at?: number }
  | { kind: "exit"; code: number; at?: number }
  | { kind: "user"; text: string; at?: number };

const APPEND_FLUSH_MS = 250;

function serializeWire(ev: WireEvent): string {
  // Stamp on serialize. Renderer falls back to Date.now() if absent,
  // which loses per-line timing on reload — stamping here gives accurate
  // timestamps for any future re-hydration of the conversation.
  const stamped = ev.at ? ev : { ...ev, at: Date.now() };
  return `${JSON.stringify(stamped)}\n`;
}

function sendPatch(
  session: Session,
  sessionId: string,
  body: Record<string, unknown>,
  tag: string,
): void {
  if (!session.jobId || !session.apiBaseUrl || !session.apiToken) {
    // Attach hasn't happened yet (or this session was started without a jobId
    // — e.g. someone called agentStart without a server-side AgentJob row).
    // We can't PATCH without a target; log the drop so it's visible in the
    // wire log when debugging.
    logLine(sessionId, "patch-drop", { tag, reason: "no-target" });
    return;
  }
  const startedAt = Date.now();
  const url = `${session.apiBaseUrl}/api/desktop-jobs/${session.jobId}`;
  void fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiToken}`,
    },
    body: JSON.stringify(body),
  })
    .then((res) => {
      if (!res.ok) {
        logLine(sessionId, "patch", {
          tag,
          ok: false,
          status: res.status,
          ms: Date.now() - startedAt,
        });
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("planbooq.wirePatch.failed", { sessionId, tag, error: msg });
      logLine(sessionId, "patch", {
        tag,
        ok: false,
        error: msg,
        ms: Date.now() - startedAt,
      });
    });
}

function flushAppend(session: Session, sessionId: string): void {
  if (session.appendTimer) {
    clearTimeout(session.appendTimer);
    session.appendTimer = null;
  }
  if (session.appendBuffer.length === 0) return;
  const text = session.appendBuffer;
  session.appendBuffer = "";
  sendPatch(session, sessionId, { appendOutput: text }, "append");
}

function enqueueAppend(session: Session, sessionId: string, chunk: string): void {
  session.appendBuffer += chunk;
  if (session.appendTimer) return;
  session.appendTimer = setTimeout(() => {
    flushAppend(session, sessionId);
  }, APPEND_FLUSH_MS);
}

function patchTerminal(session: Session, sessionId: string, code: number): void {
  if (session.terminalSent) return;
  session.terminalSent = true;
  if (session.appendTimer) {
    clearTimeout(session.appendTimer);
    session.appendTimer = null;
  }
  const pending = session.appendBuffer;
  session.appendBuffer = "";
  const exitWire = serializeWire({ kind: "exit", code });
  // Classification mirrors the renderer's previous logic (which now lives
  // here): user-Stop → CANCELED → ticket → todo; non-zero/OS-kill → FAILED
  // → ticket → blocked (human notices); zero → SUCCEEDED.
  const status: "SUCCEEDED" | "FAILED" | "CANCELED" = session.userStopped
    ? "CANCELED"
    : code === 0
      ? "SUCCEEDED"
      : "FAILED";
  sendPatch(
    session,
    sessionId,
    { appendOutput: pending + exitWire, status, exitCode: code },
    "terminal",
  );
}

function patchUserMessage(session: Session, sessionId: string, text: string): void {
  // User messages aren't on the buffered coalesce path — the renderer
  // sends them one at a time, and they need to land in conversational
  // order with the agent's reply. Send immediately as its own PATCH.
  sendPatch(session, sessionId, { appendOutput: serializeWire({ kind: "user", text }) }, "user");
}

function emit(payload: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send("planbooq:agent:event", payload);
}

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

async function writeTicketContext(wtPath: string, ctx: TicketContext): Promise<void> {
  const dir = path.join(wtPath, ".planbooq");
  await fs.mkdir(dir, { recursive: true });

  // Generic wrapper — no secrets on disk. Reads PLANBOOQ_API / PLANBOOQ_TOKEN /
  // PLANBOOQ_TICKET_ID from the process env, which the desktop app injects when
  // it spawns claude. Same script for every ticket.
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
  // Write as PLANBOOQ.md — agent-agnostic ticket context that won't clobber
  // a project's CLAUDE.md or any other tool-specific instruction file.
  await fs.writeFile(path.join(wtPath, "PLANBOOQ.md"), claudeMd);

  // Hide bootstrap files from the user's `git status` without touching the
  // project's tracked .gitignore. .git/info/exclude is worktree-local and
  // never committed — exactly what we want for ephemeral session artifacts.
  // Also defends against accidental commit of the 7-day API token in pbq.
  try {
    // In a git worktree, $GIT_DIR is .git/worktrees/<name>/. The exclude file
    // we want is the one in *that* dir so the rules are scoped to this
    // worktree only, not leaked into other worktrees of the same repo.
    const gitFile = path.join(wtPath, ".git");
    let gitDir = gitFile;
    try {
      const stat = await fs.stat(gitFile);
      if (stat.isFile()) {
        // worktree: .git is a pointer file like "gitdir: /abs/path/.git/worktrees/foo"
        const contents = await fs.readFile(gitFile, "utf8");
        const m = contents.match(/^gitdir:\s*(.+)$/m);
        if (m?.[1]) gitDir = m[1].trim();
      }
    } catch {
      // .git doesn't exist (non-git project) — skip silently.
      gitDir = "";
    }
    if (gitDir) {
      const infoDir = path.join(gitDir, "info");
      const excludePath = path.join(infoDir, "exclude");
      await fs.mkdir(infoDir, { recursive: true });
      let existing = "";
      try {
        existing = await fs.readFile(excludePath, "utf8");
      } catch {
        // file may not exist yet
      }
      const marker = "# planbooq-bootstrap";
      if (!existing.includes(marker)) {
        const block = `\n${marker}\nPLANBOOQ.md\n.planbooq/\n`;
        await fs.writeFile(excludePath, existing + block);
      }
    }
  } catch {
    // Non-fatal — bootstrap files just show up as untracked. Don't block
    // the session start over a cosmetic issue.
  }
}

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

function userMessage(text: string): string {
  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
  })}\n`;
}

function spawnClaude(
  cwd: string,
  sessionId: string,
  opts: { resumeId?: string; ticket?: TicketContext } = {},
): ChildProcess {
  const args = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (opts.resumeId) args.push("--resume", opts.resumeId);
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (opts.ticket) {
    env.PLANBOOQ_API = opts.ticket.apiBaseUrl;
    env.PLANBOOQ_TOKEN = opts.ticket.apiToken;
    env.PLANBOOQ_TICKET_ID = opts.ticket.ticketId;
  }
  const proc = spawn("claude", args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  logLine(sessionId, "spawn", {
    cwd,
    args,
    pid: proc.pid,
    resume: opts.resumeId ?? null,
    ticketId: opts.ticket?.ticketId ?? null,
  });

  let buffer = "";
  proc.stdout?.on("data", (b: Buffer) => {
    buffer += b.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      // Log the raw wire line BEFORE emitting to the renderer. This is the
      // record we read when a session freezes: timestamps on consecutive
      // stdout lines tell us where the gap is.
      logLine(sessionId, "stdout", line);
      emit({ type: "agent", sessionId, line });
      // Persist from main — see the wire-PATCH section above for the
      // rationale. The renderer is a viewer; main is the persistence
      // authority.
      const s = sessions.get(sessionId);
      if (s) enqueueAppend(s, sessionId, serializeWire({ kind: "agent", line }));
    }
  });
  proc.stderr?.on("data", (b: Buffer) => {
    const s = b.toString();
    logLine(sessionId, "stderr", s);
    emit({ type: "stderr", sessionId, line: s });
    const session = sessions.get(sessionId);
    if (session) enqueueAppend(session, sessionId, serializeWire({ kind: "stderr", line: s }));
  });
  proc.on("error", (err) => {
    log.error("claude spawn error", err);
    logLine(sessionId, "spawn-error", { error: err.message });
    emit({ type: "stderr", sessionId, line: `[spawn error] ${err.message}\n` });
    // Treat a spawn error as a terminal failure on the server side too —
    // without this the row stays RUNNING forever (no exit fires because
    // the child never started).
    const session = sessions.get(sessionId);
    if (session) {
      enqueueAppend(
        session,
        sessionId,
        serializeWire({ kind: "stderr", line: `[spawn error] ${err.message}\n` }),
      );
      patchTerminal(session, sessionId, 1);
    }
  });
  proc.on("exit", (code) => {
    const s = sessions.get(sessionId);
    if (s) {
      clearHeartbeat(s);
      // Atomic terminal PATCH: pending append + exit wire + status + exitCode
      // in a single request. Do this BEFORE deleting the session so we still
      // have jobId/apiBaseUrl/apiToken.
      patchTerminal(s, sessionId, code ?? 0);
    }
    sessions.delete(sessionId);
    logLine(sessionId, "exit", { code: code ?? 0 });
    closeLogStream(sessionId);
    emit({ type: "exit", sessionId, code: code ?? 0 });
  });
  return proc;
}

export function registerAgentIpc(): void {
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
        // Optional AgentJob id created server-side BEFORE this call. When
        // present (plus ticket.apiBaseUrl + apiToken), main starts pushing
        // heartbeats so the server's reaper knows the bridge is alive.
        jobId?: string;
      },
    ) => {
      if (!input?.repoPath || !input?.branch || !input?.firstMessage)
        return { ok: false, error: "missing fields" };
      if (!isSafeBranch(input.branch)) return { ok: false, error: "invalid branch" };
      if (!(await isGitRepo(input.repoPath))) return { ok: false, error: "not a git repo" };

      const sessionId = randomUUID();
      if (!input.ticket?.identifier) {
        return {
          ok: false,
          error: "missing ticket.identifier — worktree name requires [project].[ticket#] format",
        };
      }
      let wtName: string;
      try {
        wtName = formatWorktreeName(path.basename(input.repoPath), input.ticket.identifier);
      } catch (err) {
        if (err instanceof WorktreeNameError) return { ok: false, error: err.message };
        throw err;
      }
      const wtPath = path.join(path.dirname(input.repoPath), wtName);

      // Make `git worktree add` idempotent. Retries on the same ticket would
      // otherwise collide on either the branch (`-b` refuses to create over an
      // existing ref) or the worktree path (must not exist), surfacing as a
      // bare `exited 128` toast.
      const wtExists = await pathExists(wtPath);
      const brExists = await branchExists(input.repoPath, input.branch, sessionId);

      let result: { code: number; stderr: string; stdout: string };
      if (wtExists) {
        const list = await runOnce(
          "git",
          ["worktree", "list", "--porcelain"],
          input.repoPath,
          sessionId,
        );
        if (list.stdout.includes(`worktree ${wtPath}`)) {
          emit({ type: "stderr", sessionId, line: `(reusing existing worktree at ${wtPath})\n` });
          result = { code: 0, stderr: "", stdout: "" };
        } else {
          return {
            ok: false,
            error: `path ${wtPath} exists but is not a registered worktree — remove it and retry`,
          };
        }
      } else if (brExists) {
        emit({ type: "stderr", sessionId, line: `$ git worktree add ${wtPath} ${input.branch}\n` });
        result = await runOnce(
          "git",
          ["worktree", "add", wtPath, input.branch],
          input.repoPath,
          sessionId,
        );
      } else {
        emit({
          type: "stderr",
          sessionId,
          line: `$ git worktree add -b ${input.branch} ${wtPath}\n`,
        });
        result = await runOnce(
          "git",
          ["worktree", "add", "-b", input.branch, wtPath],
          input.repoPath,
          sessionId,
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
            sessionId,
            line: `[planbooq] could not write ticket context: ${err instanceof Error ? err.message : String(err)}\n`,
          });
        }
      }

      // Materialize any /api/attachments/<id> bytes into the worktree and
      // rewrite the firstMessage URLs to relative paths the agent can `Read`
      // directly. Without this the subprocess can't auth-fetch the URL and
      // either saves a JSON 401 body as a "PNG" or corrupts the conversation.
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
            sessionId,
            line: `[planbooq] could not write attachments: ${written.error}\n`,
          });
        }
      }

      const proc = spawnClaude(wtPath, sessionId, { ticket: input.ticket });
      sessions.set(sessionId, {
        proc,
        cwd: wtPath,
        jobId: null,
        apiBaseUrl: null,
        apiToken: null,
        heartbeatTimer: null,
        appendBuffer: "",
        appendTimer: null,
        userStopped: false,
        terminalSent: false,
      });
      if (input.jobId && input.ticket?.apiBaseUrl && input.ticket?.apiToken) {
        attachHeartbeatTarget(
          sessionId,
          input.jobId,
          input.ticket.apiBaseUrl,
          input.ticket.apiToken,
        );
      }
      const preamble =
        "Before doing anything else, read `PLANBOOQ.md` in the worktree root — it contains the ticket context, the `./.planbooq/pbq` CLI, and the exact shipping/error flow you must follow. Apply its rules for the entire session.\n\n";
      proc.stdin?.write(userMessage(preamble + firstMessage));
      // Persist the first prompt as a wire {kind:"user"} event. The renderer
      // used to do this; main does it now so persistence doesn't depend on
      // the renderer being mounted. The preamble is system-side scaffolding;
      // record only the human-authored prompt.
      const session = sessions.get(sessionId);
      if (session) patchUserMessage(session, sessionId, firstMessage);

      return { ok: true, sessionId, worktreePath: wtPath };
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
      },
    ) => {
      if (!input?.worktreePath || !input?.claudeSessionId || !input?.message)
        return { ok: false, error: "missing fields" };
      if (!(await isGitRepo(input.worktreePath)))
        return { ok: false, error: "worktree no longer exists" };

      const sessionId = randomUUID();
      const proc = spawnClaude(input.worktreePath, sessionId, {
        resumeId: input.claudeSessionId,
        ticket: input.ticket,
      });
      sessions.set(sessionId, {
        proc,
        cwd: input.worktreePath,
        jobId: null,
        apiBaseUrl: null,
        apiToken: null,
        heartbeatTimer: null,
        appendBuffer: "",
        appendTimer: null,
        userStopped: false,
        terminalSent: false,
      });
      if (input.jobId && input.ticket?.apiBaseUrl && input.ticket?.apiToken) {
        attachHeartbeatTarget(
          sessionId,
          input.jobId,
          input.ticket.apiBaseUrl,
          input.ticket.apiToken,
        );
      }
      proc.stdin?.write(userMessage(input.message));
      const session = sessions.get(sessionId);
      if (session) patchUserMessage(session, sessionId, input.message);
      return { ok: true, sessionId };
    },
  );

  ipcMain.handle(
    "planbooq:agent:send",
    async (_, input: { sessionId: string; message: string }) => {
      const s = sessions.get(input.sessionId);
      if (!s) return { ok: false, error: "session not found" };
      s.proc.stdin?.write(userMessage(input.message));
      patchUserMessage(s, input.sessionId, input.message);
      return { ok: true };
    },
  );

  ipcMain.handle("planbooq:agent:stop", async (_, input: { sessionId: string }) => {
    const s = sessions.get(input.sessionId);
    if (!s) return { ok: false, error: "session not found" };
    logLine(input.sessionId, "stop", { source: "user" });
    // Mark BEFORE kill so the imminent `exit` event is classified CANCELED
    // (user intent → ticket → todo) instead of FAILED (crash → blocked).
    // The exit handler reads userStopped during patchTerminal.
    s.userStopped = true;
    clearHeartbeat(s);
    s.proc.kill();
    // Don't delete the session entry here — the `exit` handler does that
    // after patchTerminal runs. Deleting now would orphan the terminal
    // PATCH's access to jobId/apiBaseUrl/apiToken.
    return { ok: true };
  });

  // Fire-and-finish text classification using the locally installed Claude
  // Code CLI. No worktree, no session — just `claude --print` with a single
  // prompt. Used for cheap server-adjacent decisions like picking a kanban
  // status when a workflow runs, so we don't depend on OpenRouter.
  ipcMain.handle(
    "planbooq:agent:oneshot",
    async (
      _,
      input: { prompt: string; timeoutMs?: number },
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      if (!input?.prompt || typeof input.prompt !== "string") {
        return { ok: false, error: "missing prompt" };
      }
      const timeoutMs = Math.max(1000, Math.min(60_000, input.timeoutMs ?? 20_000));
      return await new Promise((resolve) => {
        let proc: ChildProcess;
        try {
          proc = spawn("claude", ["--print", "--output-format", "text"], {
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (err) {
          resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
          return;
        }
        let out = "";
        let err = "";
        let settled = false;
        const settle = (v: { ok: boolean; text?: string; error?: string }): void => {
          if (settled) return;
          settled = true;
          try {
            proc.kill();
          } catch {}
          resolve(v);
        };
        const timer = setTimeout(() => settle({ ok: false, error: "timeout" }), timeoutMs);
        proc.stdout?.on("data", (b: Buffer) => {
          out += b.toString();
        });
        proc.stderr?.on("data", (b: Buffer) => {
          err += b.toString();
        });
        proc.on("error", (e: Error) => {
          clearTimeout(timer);
          settle({ ok: false, error: e.message });
        });
        proc.on("exit", (code) => {
          clearTimeout(timer);
          if (code === 0) settle({ ok: true, text: out.trim() });
          else settle({ ok: false, error: `exit ${code}: ${err.trim().slice(0, 200)}` });
        });
        try {
          proc.stdin?.write(input.prompt);
          proc.stdin?.end();
        } catch (e) {
          clearTimeout(timer);
          settle({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  );
}
