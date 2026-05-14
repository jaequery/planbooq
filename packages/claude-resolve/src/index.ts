import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ResolveClaudeResult = { ok: true; executable: string } | { ok: false; message: string };

const INSTALL_HINT =
  "Install Claude Code from Anthropic (see https://docs.anthropic.com/en/docs/claude-code), restart Planbooq, or set PLANBOOQ_CLAUDE_BIN to the full path of your claude executable.";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isRunnableFile(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

/** Prepends directories where Claude Code is commonly installed (GUI apps often lack these on PATH). */
export function mergePathWithCommonCliDirs(pathEnv = ""): string {
  const dirs: string[] = [];
  if (process.platform === "darwin") {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin");
  } else if (process.platform === "linux") {
    dirs.push("/usr/local/bin", "/usr/bin", "/bin");
  }
  const home = os.homedir();
  dirs.push(
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".opencode", "bin"),
    path.join(home, ".volta", "bin"),
  );
  if (process.platform === "win32") {
    const ad = process.env.APPDATA;
    const la = process.env.LOCALAPPDATA;
    if (ad) dirs.push(path.join(ad, "npm"));
    if (la) dirs.push(path.join(la, "Programs"));
  }
  const existing = dirs.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  const merged = [...existing, pathEnv].filter((s) => s.length > 0).join(path.delimiter);
  return merged;
}

function tryExplicit(envKeys: readonly string[]): string | null {
  for (const key of envKeys) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    const expanded = expandHome(raw);
    if (isRunnableFile(expanded)) return expanded;
  }
  return null;
}

function namesForPlatform(): string[] {
  if (process.platform === "win32") return ["claude.exe", "claude.cmd", "claude.bat"];
  return ["claude"];
}

function candidateDirs(): string[] {
  const home = os.homedir();
  const dirs: string[] = [];
  if (process.platform === "darwin") {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  }
  dirs.push(
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".opencode", "bin"),
  );
  dirs.push(path.join(home, ".volta", "bin"));
  if (process.platform === "win32") {
    const ad = process.env.APPDATA;
    const la = process.env.LOCALAPPDATA;
    if (ad) dirs.push(path.join(ad, "npm"));
    if (la) dirs.push(path.join(la, "Programs"));
  }
  return dirs;
}

function scanKnownLocations(): string | null {
  for (const dir of candidateDirs()) {
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of namesForPlatform()) {
      const full = path.join(dir, name);
      if (isRunnableFile(full)) return full;
    }
  }

  // npm-style global shim under NVM — optional last resort (cheap scan).
  if (process.platform !== "win32") {
    try {
      const nvmRoot = path.join(os.homedir(), ".nvm", "versions", "node");
      const versions = fs.readdirSync(nvmRoot);
      versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) {
        const candidate = path.join(nvmRoot, v, "bin", "claude");
        if (isRunnableFile(candidate)) return candidate;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function tryWhich(): string | null {
  const env = {
    ...process.env,
    PATH: mergePathWithCommonCliDirs(process.env.PATH ?? ""),
  };

  if (process.platform === "win32") {
    const r = spawnSync("where.exe", ["claude"], { encoding: "utf8", env });
    if (r.status !== 0 || !r.stdout) return null;
    const line = r.stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return line && isRunnableFile(line) ? line : null;
  }

  const r = spawnSync("/usr/bin/which", ["claude"], { encoding: "utf8", env });
  if (r.status !== 0 || !r.stdout) return null;
  const line = r.stdout.trim().split("\n")[0]?.trim();
  return line && isRunnableFile(line) ? line : null;
}

export function resolveClaudeExecutable(): ResolveClaudeResult {
  const explicit = tryExplicit(["PLANBOOQ_CLAUDE_BIN", "CLAUDE_BIN"]);
  if (explicit) return { ok: true, executable: explicit };

  const scanned = scanKnownLocations();
  if (scanned) return { ok: true, executable: scanned };

  const which = tryWhich();
  if (which) return { ok: true, executable: which };

  return {
    ok: false,
    message: `Could not find the Claude Code CLI. ${INSTALL_HINT}`,
  };
}
