#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../hooks/post-tool-use.mjs",
);
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import * as Ably from "ably";

const CONFIG_DIR = path.join(os.homedir(), ".planbooq");
const CONFIG_FILE = path.join(CONFIG_DIR, "agent.json");
const DEFAULT_SERVER = process.env.PLANBOOQ_URL ?? "http://localhost:3636";

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

async function api(server, pathname, init = {}, token) {
  const headers = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(new URL(pathname, server).toString(), { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(`${pathname} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function cmdLogin() {
  const rl = readline.createInterface({ input, output });
  const server = (await rl.question(`Planbooq URL [${DEFAULT_SERVER}]: `)).trim() || DEFAULT_SERVER;
  console.log(`\nIn the Planbooq web app, go to Settings → Agents and click "Pair new agent".`);
  console.log(`You'll see an 8-character code like ABCD-EFGH.\n`);
  const code = (await rl.question("Pair code: ")).trim();
  const workspaceId = (await rl.question("Workspace id: ")).trim();
  const repoRoot =
    (await rl.question(`Repo root for this agent [${process.cwd()}]: `)).trim() || process.cwd();
  rl.close();

  const body = await api(server, "/api/agents/pair", {
    method: "POST",
    body: JSON.stringify({
      code,
      workspaceId,
      hostname: os.hostname(),
      platform: process.platform,
    }),
  });
  const { agentId, token, name } = body.data;
  saveConfig({ server, agentId, token, repoRoot, name });
  console.log(`\n✓ Paired as "${name}" (agent ${agentId}).`);
  console.log(`  Repo root: ${repoRoot}`);
  console.log(`  Run: planbooq-agent start`);
}

function ensureClaudeHook(repoRoot) {
  try {
    const dir = path.join(repoRoot, ".claude");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.local.json");
    let cfg = {};
    if (existsSync(file)) {
      try {
        cfg = JSON.parse(readFileSync(file, "utf8"));
      } catch {}
    }
    cfg.hooks = cfg.hooks ?? {};
    const desired = {
      matcher: "Bash",
      hooks: [{ type: "command", command: `node ${JSON.stringify(HOOK_PATH).slice(1, -1)}` }],
    };
    const existing = Array.isArray(cfg.hooks.PostToolUse) ? cfg.hooks.PostToolUse : [];
    const filtered = existing.filter(
      (h) => !JSON.stringify(h).includes("post-tool-use.mjs"),
    );
    cfg.hooks.PostToolUse = [...filtered, desired];
    writeFileSync(file, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error("[agent] failed to install hook:", e.message);
  }
}

function execClaude(prompt, repoRoot, env, onChunk) {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", prompt, "--output-format", "stream-json"], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
    });
    child.stdout.on("data", (b) => onChunk(b.toString("utf8")));
    child.stderr.on("data", (b) => onChunk(b.toString("utf8")));
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      onChunk(`\n[agent] failed to spawn claude: ${err.message}\n`);
      resolve(127);
    });
  });
}

async function patchJob(cfg, jobId, body) {
  return api(
    cfg.server,
    `/api/agents/jobs/${jobId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    cfg.token,
  );
}

async function handleJob(cfg, msg) {
  const { jobId, prompt, ticketId } = msg;
  console.log(`\n[job ${jobId}] running…`);
  await patchJob(cfg, jobId, { status: "RUNNING" });
  ensureClaudeHook(cfg.repoRoot);

  let buffer = "";
  let lastFlush = Date.now();
  const flush = async (force = false) => {
    if (!buffer) return;
    if (!force && Date.now() - lastFlush < 500 && buffer.length < 2048) return;
    const chunk = buffer;
    buffer = "";
    lastFlush = Date.now();
    try {
      await patchJob(cfg, jobId, { appendOutput: chunk });
    } catch (e) {
      console.error("flush failed:", e.message);
    }
  };

  const hookEnv = {
    PLANBOOQ_SERVER: cfg.server,
    PLANBOOQ_TOKEN: cfg.token,
    PLANBOOQ_JOB_ID: jobId,
    PLANBOOQ_TICKET_ID: ticketId ?? "",
  };
  const code = await execClaude(prompt, cfg.repoRoot, hookEnv, (text) => {
    process.stdout.write(text);
    buffer += text;
    void flush(false);
  });
  await flush(true);
  await patchJob(cfg, jobId, {
    status: code === 0 ? "SUCCEEDED" : "FAILED",
    exitCode: code,
  });
  console.log(`[job ${jobId}] exit ${code}`);
}

async function cmdStart() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not paired. Run: planbooq-agent login");
    process.exit(1);
  }
  // sanity check
  await api(cfg.server, "/api/agents/me", {}, cfg.token);

  const ably = new Ably.Realtime({
    authCallback: async (_params, callback) => {
      try {
        const tr = await api(cfg.server, "/api/agents/ably-token", { method: "POST" }, cfg.token);
        callback(null, tr);
      } catch (e) {
        callback(e, null);
      }
    },
  });

  const channel = ably.channels.get(`agent:${cfg.agentId}`);
  await channel.subscribe("job.dispatch", (m) => {
    void handleJob(cfg, m.data).catch((err) => console.error("job failed:", err));
  });
  console.log(`✓ Connected to ${cfg.server} as agent ${cfg.agentId}`);
  console.log(`  Repo root: ${cfg.repoRoot}`);
  console.log("  Waiting for jobs… (Ctrl-C to quit)");
}

const cmd = process.argv[2];
if (cmd === "login") {
  cmdLogin().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else if (cmd === "start") {
  cmdStart().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  console.log("Usage: planbooq-agent <login|start>");
  process.exit(1);
}
