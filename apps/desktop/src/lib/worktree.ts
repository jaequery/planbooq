import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { mergePathWithCommonCliDirs, resolveClaudeExecutable } from "@planbooq/claude-resolve";
import { BrowserWindow, dialog, ipcMain } from "electron";
import log from "electron-log/main";
import { formatWorktreeName, WorktreeNameError } from "./worktree-name";

interface SpawnInput {
  repoPath: string;
  branch: string;
  prompt: string;
  ticketIdentifier: string;
}

function isSafeBranch(s: string): boolean {
  return /^[A-Za-z0-9._/-]{1,200}$/.test(s) && !s.includes("..");
}

function emit(line: string) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("planbooq:worktree:log", line);
}

async function run(cmd: string, args: string[], cwd: string, envPatch?: Record<string, string>) {
  return new Promise<{ code: number; stderr: string; stdout: string }>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: envPatch ? { ...process.env, ...envPatch } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (b) => {
      const s = b.toString();
      stdout += s;
      emit(s);
    });
    proc.stderr.on("data", (b) => {
      const s = b.toString();
      stderr += s;
      emit(s);
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

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const r = await run("git", ["rev-parse", "--verify", `refs/heads/${branch}`], repoPath);
  return r.code === 0;
}

// Return the path of the worktree currently checked out on `branch`, or null.
// `git worktree add <path> <branch>` refuses if the branch is already used by
// another worktree, so callers reuse or prune accordingly.
async function findWorktreeForBranch(repoPath: string, branch: string): Promise<string | null> {
  const r = await run("git", ["worktree", "list", "--porcelain"], repoPath);
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

async function isGitRepo(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(p, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

export function registerWorktreeIpc(): void {
  ipcMain.handle("planbooq:worktree:pickRepo", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      message: "Select a git repo to spawn worktrees from",
    });
    const p = result.filePaths[0];
    if (result.canceled || !p) return { ok: false };
    if (!(await isGitRepo(p))) return { ok: false, error: "not a git repo" };
    return { ok: true, path: p };
  });

  ipcMain.handle("planbooq:worktree:spawn", async (_, input: SpawnInput) => {
    if (!input?.repoPath || !input?.branch || !input?.prompt || !input?.ticketIdentifier) {
      return {
        ok: false,
        error: "missing required fields (repoPath, branch, prompt, ticketIdentifier)",
      };
    }
    if (!isSafeBranch(input.branch)) return { ok: false, error: "invalid branch name" };
    if (!(await isGitRepo(input.repoPath))) return { ok: false, error: "not a git repo" };

    let wtName: string;
    try {
      wtName = formatWorktreeName(path.basename(input.repoPath), input.ticketIdentifier);
    } catch (err) {
      if (err instanceof WorktreeNameError) return { ok: false, error: err.message };
      throw err;
    }
    let wtPath = path.join(path.dirname(input.repoPath), wtName);

    // Make `git worktree add` idempotent. Retries on the same ticket would
    // otherwise collide on either the branch (`-b` refuses to create over an
    // existing ref) or the worktree path (must not exist), surfacing as a
    // bare `exited 128` toast. We branch on what's already there:
    //   - path exists & is registered as a worktree → reuse it
    //   - branch is already checked out elsewhere   → reuse that worktree (or
    //                                                  prune if its path is gone)
    //   - branch exists but no worktree              → check it out into wtPath
    //   - neither                                    → create both with `-b`
    const wtExists = await pathExists(wtPath);
    const brExists = await branchExists(input.repoPath, input.branch);

    let result: { code: number; stderr: string; stdout: string };
    if (wtExists) {
      // Trust an already-prepared worktree; verify git knows about it.
      const list = await run("git", ["worktree", "list", "--porcelain"], input.repoPath);
      if (list.stdout.includes(`worktree ${wtPath}`)) {
        emit(`(reusing existing worktree at ${wtPath})\n`);
        result = { code: 0, stderr: "", stdout: "" };
      } else {
        return {
          ok: false,
          error: `path ${wtPath} exists but is not a registered worktree — remove it and retry`,
        };
      }
    } else if (brExists) {
      const existing = await findWorktreeForBranch(input.repoPath, input.branch);
      if (existing && (await pathExists(existing))) {
        emit(
          `(branch ${input.branch} is already checked out at ${existing} — reusing that worktree)\n`,
        );
        wtPath = existing;
        result = { code: 0, stderr: "", stdout: "" };
      } else {
        if (existing) {
          emit(
            `(branch ${input.branch} was registered at ${existing}, but that path is gone — pruning stale worktree)\n`,
          );
          await run("git", ["worktree", "prune"], input.repoPath);
        }
        emit(`$ git worktree add ${wtPath} ${input.branch}\n`);
        result = await run("git", ["worktree", "add", wtPath, input.branch], input.repoPath);
      }
    } else {
      emit(`$ git worktree add -b ${input.branch} ${wtPath}\n`);
      result = await run("git", ["worktree", "add", "-b", input.branch, wtPath], input.repoPath);
    }

    if (result.code !== 0) {
      const detail = lastNonEmptyLine(result.stderr) || `exit ${result.code}`;
      return { ok: false, error: `git worktree add failed: ${detail}` };
    }

    // Best-effort: invoke claude CLI if present, otherwise just leave the worktree.
    const resolved = resolveClaudeExecutable();
    emit(`$ claude --print ${JSON.stringify(input.prompt).slice(0, 60)}...\n`);
    if (!resolved.ok) {
      emit(`${resolved.message}\n`);
    } else {
      try {
        const claudeRes = await run(resolved.executable, ["--print", input.prompt], wtPath, {
          PATH: mergePathWithCommonCliDirs(process.env.PATH ?? ""),
        });
        if (claudeRes.code !== 0) emit(`(claude exited ${claudeRes.code})\n`);
      } catch (err) {
        log.warn("claude not available", err);
        emit("claude CLI failed to start — worktree created, run claude there manually\n");
      }
    }
    return { ok: true, worktreePath: wtPath, branch: input.branch };
  });

  // Remove a worktree (and optionally its branch) after the ticket completes.
  // Best-effort: tolerates the path being gone, the worktree being unregistered,
  // or the branch being unmerged — in each case we report what happened without
  // throwing. Renderer treats this as fire-and-forget.
  ipcMain.handle(
    "planbooq:worktree:remove",
    async (
      _,
      input: { repoPath: string; worktreePath: string; branch?: string | null },
    ): Promise<{
      ok: boolean;
      removedWorktree: boolean;
      removedBranch: boolean;
      error?: string;
    }> => {
      if (!input?.repoPath || !input?.worktreePath) {
        return {
          ok: false,
          removedWorktree: false,
          removedBranch: false,
          error: "missing repoPath or worktreePath",
        };
      }
      if (!path.isAbsolute(input.repoPath) || !path.isAbsolute(input.worktreePath)) {
        return {
          ok: false,
          removedWorktree: false,
          removedBranch: false,
          error: "paths must be absolute",
        };
      }
      if (!(await isGitRepo(input.repoPath))) {
        return {
          ok: false,
          removedWorktree: false,
          removedBranch: false,
          error: "repoPath is not a git repo",
        };
      }

      let removedWorktree = false;
      const wtStillThere = await pathExists(input.worktreePath);
      if (wtStillThere) {
        // --force ignores Planbooq's injected untracked files (.planbooq/,
        // CLAUDE.local.md, PLANBOOQ.md) which would otherwise block removal.
        const r = await run(
          "git",
          ["worktree", "remove", "--force", input.worktreePath],
          input.repoPath,
        );
        if (r.code === 0) {
          removedWorktree = true;
        } else {
          // Path exists but git refused. Most common cause: it was never a
          // registered worktree (or the .git pointer is gone). Leave it alone.
          log.warn(
            "worktree:remove refused",
            input.worktreePath,
            lastNonEmptyLine(r.stderr) || `exit ${r.code}`,
          );
        }
      } else {
        // Path already gone — prune stale metadata so `git worktree list` is clean.
        await run("git", ["worktree", "prune"], input.repoPath);
        removedWorktree = true;
      }

      let removedBranch = false;
      if (input.branch && isSafeBranch(input.branch)) {
        // -d (safe): refuses if the branch isn't merged into HEAD or its upstream.
        // We don't use -D because the server only asks for cleanup once the PR
        // is actually merged; if -d refuses, the branch carries unmerged work
        // and the user should review it manually.
        const r = await run("git", ["branch", "-d", input.branch], input.repoPath);
        if (r.code === 0) {
          removedBranch = true;
        } else {
          log.info(
            "worktree:remove branch retained",
            input.branch,
            lastNonEmptyLine(r.stderr) || `exit ${r.code}`,
          );
        }
      }

      return { ok: true, removedWorktree, removedBranch };
    },
  );
}
