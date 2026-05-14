import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mergePathWithCommonCliDirs } from "@planbooq/claude-resolve";
import { app } from "electron";
import log from "electron-log/main";

// =============================================================================
// HTTP-over-Unix-socket client for talking to the broker daemon.
//
// The broker (apps/broker/dist/broker.cjs) is a separate Node process spawned
// detached from Electron, so it survives the user closing or quitting the app.
// Electron talks to it via a stable socket at
// ~/Library/Application Support/Planbooq/broker.sock.
// =============================================================================

function brokerSocketPath(): string {
  if (process.env.PLANBOOQ_BROKER_SOCK) return process.env.PLANBOOQ_BROKER_SOCK;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Planbooq", "broker.sock");
  }
  return path.join(process.env.XDG_RUNTIME_DIR ?? "/tmp", "broker.sock");
}

function brokerEntryPath(): string {
  // Dev: built broker sits at <repo>/apps/broker/dist/broker.cjs. Packaged:
  // forge copies it into the asar-unpacked resources dir; we expose it via
  // process.resourcesPath. The env override is for manual testing.
  if (process.env.PLANBOOQ_BROKER_ENTRY) return process.env.PLANBOOQ_BROKER_ENTRY;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "broker.cjs");
  }
  // In dev, __dirname is apps/desktop/.vite/build; broker lives two apps up.
  return path.resolve(__dirname, "..", "..", "..", "broker", "dist", "broker.cjs");
}

// -----------------------------------------------------------------------------
// Request helpers
// -----------------------------------------------------------------------------

type HttpResult = { status: number; body: string };

function httpRequest(
  method: string,
  urlPath: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        socketPath: brokerSocketPath(),
        path: urlPath,
        method,
        headers:
          payload === undefined
            ? { Accept: "application/json" }
            : {
                Accept: "application/json",
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          buf += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: buf }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("broker request timed out"));
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export async function callBroker<TReq, TRes>(
  method: "GET" | "POST",
  path: string,
  body?: TReq,
  timeoutMs?: number,
): Promise<TRes> {
  const r = await httpRequest(method, path, body, timeoutMs);
  if (r.body.length === 0) return {} as TRes;
  return JSON.parse(r.body) as TRes;
}

// -----------------------------------------------------------------------------
// Lifecycle: spawn the broker if it isn't running, and wait until it answers.
// -----------------------------------------------------------------------------

let brokerStarted = false;

async function isBrokerAlive(): Promise<boolean> {
  try {
    const r = await httpRequest("GET", "/ping");
    return r.status === 200;
  } catch {
    return false;
  }
}

async function spawnBrokerDetached(): Promise<void> {
  const entry = brokerEntryPath();
  try {
    await fs.access(entry);
  } catch {
    throw new Error(
      `broker entry not found at ${entry} — run \`pnpm --filter @planbooq/broker build\``,
    );
  }
  // Detached + unref + ignored stdio is the holy trinity that lets the broker
  // outlive Electron. Using `process.execPath` with ELECTRON_RUN_AS_NODE means
  // we don't have to ship a separate Node binary — Electron's bundled Node
  // runs the broker script.
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PATH: mergePathWithCommonCliDirs(process.env.PATH ?? ""),
      // Strip Electron-specific flags that confuse plain Node.
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? "",
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  log.info("broker.spawn", { pid: child.pid, entry });
}

async function waitForBroker(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 100;
  while (Date.now() < deadline) {
    if (await isBrokerAlive()) return;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 1000);
  }
  throw new Error("broker failed to start within timeout");
}

export async function ensureBrokerRunning(): Promise<void> {
  if (brokerStarted && (await isBrokerAlive())) return;
  if (await isBrokerAlive()) {
    brokerStarted = true;
    return;
  }
  await spawnBrokerDetached();
  await waitForBroker(5_000);
  brokerStarted = true;
}

// -----------------------------------------------------------------------------
// SSE event stream.
// -----------------------------------------------------------------------------

type SseListener = (ev: unknown) => void;

let sseRequest: http.ClientRequest | null = null;
const sseListeners = new Set<SseListener>();
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function startSseStream(): void {
  if (sseRequest) return;
  const req = http.request({
    socketPath: brokerSocketPath(),
    path: "/events",
    method: "GET",
    headers: { Accept: "text/event-stream" },
  });
  sseRequest = req;
  req.on("response", (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      scheduleSseReconnect();
      return;
    }
    let buffer = "";
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      buffer += chunk;
      // SSE frames are separated by \n\n. Each `data:` line carries one JSON
      // event payload.
      while (true) {
        const idx = buffer.indexOf("\n\n");
        if (idx === -1) break;
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const ev = JSON.parse(dataLine.slice("data: ".length));
          for (const l of sseListeners) {
            try {
              l(ev);
            } catch {}
          }
        } catch {
          // skip malformed frame
        }
      }
    });
    res.on("end", () => {
      sseRequest = null;
      scheduleSseReconnect();
    });
    res.on("error", () => {
      sseRequest = null;
      scheduleSseReconnect();
    });
  });
  req.on("error", () => {
    sseRequest = null;
    scheduleSseReconnect();
  });
  req.end();
}

function scheduleSseReconnect(): void {
  if (sseReconnectTimer) return;
  sseReconnectTimer = setTimeout(() => {
    sseReconnectTimer = null;
    // Only reconnect if there's still someone listening — otherwise drop
    // the connection and let the next subscribe() restart it.
    if (sseListeners.size > 0) startSseStream();
  }, 1_000);
}

export function onBrokerEvent(listener: SseListener): () => void {
  sseListeners.add(listener);
  if (!sseRequest) startSseStream();
  return () => {
    sseListeners.delete(listener);
  };
}
