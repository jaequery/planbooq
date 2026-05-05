import { BrowserWindow, ipcMain } from "electron";
import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import log from "electron-log/main";

type Session = { proc: ChildProcess; cwd: string };

const sessions = new Map<string, Session>();

function emit(payload: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send("planbooq:agent:event", payload);
}

function isSafeBranch(s: string): boolean {
  return /^[A-Za-z0-9._/\-]{1,200}$/.test(s) && !s.includes("..");
}

async function isGitRepo(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(p, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function runOnce(cmd: string, args: string[], cwd: string, sessionId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout?.on("data", (b: Buffer) =>
      emit({ type: "stderr", sessionId, line: b.toString() }),
    );
    proc.stderr?.on("data", (b: Buffer) =>
      emit({ type: "stderr", sessionId, line: b.toString() }),
    );
    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? 0));
  });
}

function userMessage(text: string): string {
  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
  })}\n`;
}

function spawnClaude(cwd: string, sessionId: string, resumeId?: string): ChildProcess {
  const args = [
    "--print",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (resumeId) args.push("--resume", resumeId);
  const proc = spawn("claude", args, {
    cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  proc.stdout?.on("data", (b: Buffer) => {
    buffer += b.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      emit({ type: "agent", sessionId, line });
    }
  });
  proc.stderr?.on("data", (b: Buffer) =>
    emit({ type: "stderr", sessionId, line: b.toString() }),
  );
  proc.on("error", (err) => {
    log.error("claude spawn error", err);
    emit({ type: "stderr", sessionId, line: `[spawn error] ${err.message}\n` });
  });
  proc.on("exit", (code) => {
    sessions.delete(sessionId);
    emit({ type: "exit", sessionId, code: code ?? 0 });
  });
  return proc;
}

export function registerAgentIpc(): void {
  ipcMain.handle(
    "planbooq:agent:start",
    async (_, input: { repoPath: string; branch: string; firstMessage: string }) => {
      if (!input?.repoPath || !input?.branch || !input?.firstMessage)
        return { ok: false, error: "missing fields" };
      if (!isSafeBranch(input.branch)) return { ok: false, error: "invalid branch" };
      if (!(await isGitRepo(input.repoPath))) return { ok: false, error: "not a git repo" };

      const sessionId = randomUUID();
      const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const wtName = `${path.basename(input.repoPath)}.planbooq-${ts}`;
      const wtPath = path.join(path.dirname(input.repoPath), wtName);

      emit({ type: "stderr", sessionId, line: `$ git worktree add -b ${input.branch} ${wtPath}\n` });
      const code = await runOnce(
        "git",
        ["worktree", "add", "-b", input.branch, wtPath],
        input.repoPath,
        sessionId,
      );
      if (code !== 0) return { ok: false, error: `git worktree add exited ${code}` };

      const proc = spawnClaude(wtPath, sessionId);
      sessions.set(sessionId, { proc, cwd: wtPath });
      proc.stdin?.write(userMessage(input.firstMessage));

      return { ok: true, sessionId, worktreePath: wtPath };
    },
  );

  ipcMain.handle(
    "planbooq:agent:resume",
    async (
      _,
      input: { worktreePath: string; claudeSessionId: string; message: string },
    ) => {
      if (!input?.worktreePath || !input?.claudeSessionId || !input?.message)
        return { ok: false, error: "missing fields" };
      if (!(await isGitRepo(input.worktreePath)))
        return { ok: false, error: "worktree no longer exists" };

      const sessionId = randomUUID();
      const proc = spawnClaude(input.worktreePath, sessionId, input.claudeSessionId);
      sessions.set(sessionId, { proc, cwd: input.worktreePath });
      proc.stdin?.write(userMessage(input.message));
      return { ok: true, sessionId };
    },
  );

  ipcMain.handle(
    "planbooq:agent:send",
    async (_, input: { sessionId: string; message: string }) => {
      const s = sessions.get(input.sessionId);
      if (!s) return { ok: false, error: "session not found" };
      s.proc.stdin?.write(userMessage(input.message));
      return { ok: true };
    },
  );

  ipcMain.handle("planbooq:agent:stop", async (_, input: { sessionId: string }) => {
    const s = sessions.get(input.sessionId);
    if (!s) return { ok: false, error: "session not found" };
    s.proc.kill();
    sessions.delete(input.sessionId);
    return { ok: true };
  });
}
