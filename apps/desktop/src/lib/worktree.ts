import { ipcMain, dialog, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import log from "electron-log/main";
import { WorktreeNameError, formatWorktreeName } from "./worktree-name";

interface SpawnInput {
  repoPath: string;
  branch: string;
  prompt: string;
  ticketIdentifier: string;
}

function isSafeBranch(s: string): boolean {
  return /^[A-Za-z0-9._/\-]{1,200}$/.test(s) && !s.includes("..");
}

function emit(line: string) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("planbooq:worktree:log", line);
}

async function run(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stderr: string; stdout: string }>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: process.env,
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
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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
      return { ok: false, error: "missing required fields (repoPath, branch, prompt, ticketIdentifier)" };
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
    const wtPath = path.join(path.dirname(input.repoPath), wtName);

    // Make `git worktree add` idempotent. Retries on the same ticket would
    // otherwise collide on either the branch (`-b` refuses to create over an
    // existing ref) or the worktree path (must not exist), surfacing as a
    // bare `exited 128` toast. We branch on what's already there:
    //   - path exists & is registered as a worktree → reuse it
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
      emit(`$ git worktree add ${wtPath} ${input.branch}\n`);
      result = await run(
        "git",
        ["worktree", "add", wtPath, input.branch],
        input.repoPath,
      );
    } else {
      emit(`$ git worktree add -b ${input.branch} ${wtPath}\n`);
      result = await run(
        "git",
        ["worktree", "add", "-b", input.branch, wtPath],
        input.repoPath,
      );
    }

    if (result.code !== 0) {
      const detail = lastNonEmptyLine(result.stderr) || `exit ${result.code}`;
      return { ok: false, error: `git worktree add failed: ${detail}` };
    }

    // Best-effort: invoke claude CLI if present, otherwise just leave the worktree.
    emit(`$ claude --print ${JSON.stringify(input.prompt).slice(0, 60)}...\n`);
    try {
      const claudeRes = await run("claude", ["--print", input.prompt], wtPath);
      if (claudeRes.code !== 0) emit(`(claude exited ${claudeRes.code})\n`);
    } catch (err) {
      log.warn("claude not available", err);
      emit("claude CLI not found in PATH — worktree created, run claude there manually\n");
    }
    return { ok: true, worktreePath: wtPath, branch: input.branch };
  });
}
