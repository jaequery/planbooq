import { ipcMain, dialog, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import log from "electron-log/main";

interface SpawnInput {
  repoPath: string;
  branch: string;
  prompt: string;
}

function isSafeBranch(s: string): boolean {
  return /^[A-Za-z0-9._/\-]{1,200}$/.test(s) && !s.includes("..");
}

function emit(line: string) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("planbooq:worktree:log", line);
}

async function run(cmd: string, args: string[], cwd: string) {
  return new Promise<number>((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env });
    proc.stdout.on("data", (b) => emit(b.toString()));
    proc.stderr.on("data", (b) => emit(b.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? 0));
  });
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
    if (!input?.repoPath || !input?.branch || !input?.prompt) {
      return { ok: false, error: "missing required fields" };
    }
    if (!isSafeBranch(input.branch)) return { ok: false, error: "invalid branch name" };
    if (!(await isGitRepo(input.repoPath))) return { ok: false, error: "not a git repo" };

    const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const wtName = `${path.basename(input.repoPath)}.planbooq-${ts}`;
    const wtPath = path.join(path.dirname(input.repoPath), wtName);

    emit(`$ git worktree add -b ${input.branch} ${wtPath}\n`);
    const code = await run("git", ["worktree", "add", "-b", input.branch, wtPath], input.repoPath);
    if (code !== 0) return { ok: false, error: `git worktree add exited ${code}` };

    // Best-effort: invoke claude CLI if present, otherwise just leave the worktree.
    emit(`$ claude --print ${JSON.stringify(input.prompt).slice(0, 60)}...\n`);
    try {
      const claudeCode = await run("claude", ["--print", input.prompt], wtPath);
      if (claudeCode !== 0) emit(`(claude exited ${claudeCode})\n`);
    } catch (err) {
      log.warn("claude not available", err);
      emit("claude CLI not found in PATH — worktree created, run claude there manually\n");
    }
    return { ok: true, worktreePath: wtPath, branch: input.branch };
  });
}
