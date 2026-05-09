import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log/main";

type PullResult =
  | { ok: true; branch: string; updated: boolean; output: string }
  | { ok: false; error: string };

function emit(payload: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("planbooq:git:event", payload);
}

async function isGitRepo(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(p, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function exec(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function detectDefaultBranch(repoPath: string): Promise<string | null> {
  // Prefer the remote HEAD symref — set when the repo was cloned. Falls back
  // to `main` then `master` if the symref isn't present (older clones).
  const ref = await exec("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoPath);
  if (ref.code === 0) {
    const name = ref.stdout.trim().replace(/^origin\//, "");
    if (name) return name;
  }
  for (const candidate of ["main", "master"]) {
    const r = await exec(
      "git",
      ["show-ref", "--verify", `refs/remotes/origin/${candidate}`],
      repoPath,
    );
    if (r.code === 0) return candidate;
  }
  return null;
}

async function currentBranch(repoPath: string): Promise<string | null> {
  const r = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
  if (r.code !== 0) return null;
  const name = r.stdout.trim();
  return name === "HEAD" ? null : name;
}

async function revParse(repoPath: string, ref: string): Promise<string | null> {
  const r = await exec("git", ["rev-parse", ref], repoPath);
  if (r.code !== 0) return null;
  return r.stdout.trim() || null;
}

export async function pullMain(repoPath: string): Promise<PullResult> {
  if (!repoPath) return { ok: false, error: "missing repoPath" };
  if (!(await isGitRepo(repoPath))) return { ok: false, error: "not a git repo" };

  const branch = await detectDefaultBranch(repoPath);
  if (!branch) return { ok: false, error: "could not detect default branch" };

  const before = await revParse(repoPath, branch);

  const fetched = await exec("git", ["fetch", "origin", branch], repoPath);
  if (fetched.code !== 0) {
    return {
      ok: false,
      error: `git fetch failed: ${fetched.stderr.trim() || `exit ${fetched.code}`}`,
    };
  }

  const cur = await currentBranch(repoPath);
  let output = fetched.stderr;

  if (cur === branch) {
    // Default branch is checked out — fast-forward against the unambiguous
    // remote-tracking ref. Avoid `git pull --ff-only`: if the user's
    // remote.origin.fetch config produces multiple "for-merge" entries in
    // FETCH_HEAD, pull's implicit merge fails with "Cannot fast-forward to
    // multiple branches".
    const merged = await exec(
      "git",
      ["merge", "--ff-only", `refs/remotes/origin/${branch}`],
      repoPath,
    );
    output += merged.stdout + merged.stderr;
    if (merged.code !== 0) {
      const stderr = merged.stderr.trim();
      const hint = /multiple branches/i.test(stderr)
        ? ` — multiple FETCH_HEAD entries; check 'git config --get-all remote.origin.fetch'`
        : "";
      return {
        ok: false,
        error: `git merge --ff-only origin/${branch} failed: ${stderr || `exit ${merged.code}`}${hint}`,
      };
    }
  } else {
    // Default branch is not checked out — fast-forward the local ref directly
    // without touching the working tree of whichever feature branch is current.
    const updated = await exec("git", ["fetch", "origin", `${branch}:${branch}`], repoPath);
    output += updated.stderr;
    if (updated.code !== 0) {
      return {
        ok: false,
        error: `git fetch ${branch}:${branch} failed: ${updated.stderr.trim() || `exit ${updated.code}`}`,
      };
    }
  }

  const after = await revParse(repoPath, branch);
  const updated = before !== null && after !== null && before !== after;
  emit({ type: "pull", repoPath, branch, updated, before, after });
  return { ok: true, branch, updated, output };
}

export function registerGitIpc(): void {
  ipcMain.handle("planbooq:git:pullMain", async (_, input: { repoPath: string }) => {
    try {
      return await pullMain(input?.repoPath ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("planbooq:git:pullMain failed", err);
      return { ok: false, error: msg };
    }
  });
}
