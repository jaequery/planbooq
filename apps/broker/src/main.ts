import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type {
  ListSessionsResponse,
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
} from "./protocol";
import {
  findSessionByTicket,
  listSessions,
  logLine,
  oneshot,
  resumeSession,
  sendToSession,
  startSession,
  stopSession,
  subscribe,
} from "./sessions";

// =============================================================================
// Socket location. macOS: ~/Library/Application Support/Planbooq/broker.sock.
// We keep the socket path stable across broker restarts so Electron can always
// find us at the same address.
// =============================================================================

function socketDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Planbooq");
  }
  // Linux fallback for dev — XDG_RUNTIME_DIR if available, else /tmp.
  return process.env.XDG_RUNTIME_DIR ?? "/tmp";
}

function socketPath(): string {
  return process.env.PLANBOOQ_BROKER_SOCK ?? path.join(socketDir(), "broker.sock");
}

async function ensureSocketDir(): Promise<void> {
  await fs.mkdir(path.dirname(socketPath()), { recursive: true });
}

async function clearStaleSocket(): Promise<void> {
  const sock = socketPath();
  try {
    // If a previous broker died without unlinking, a stale socket file remains
    // and our `listen()` will EADDRINUSE. Probe with a quick HTTP HEAD; if
    // nothing answers, remove and continue.
    const alive = await pingExisting(sock);
    if (alive) {
      // Another broker is already serving. Exit cleanly with a recognizable
      // code so the Electron main can detect this and proceed.
      process.stderr.write("broker: another instance is already running\n");
      process.exit(7);
    }
    await fs.unlink(sock).catch(() => undefined);
  } catch {
    // best-effort
  }
}

function pingExisting(sock: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { socketPath: sock, path: "/ping", method: "GET", timeout: 500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// =============================================================================
// Request helpers
// =============================================================================

function readJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data.length === 0 ? ({} as T) : (JSON.parse(data) as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// =============================================================================
// HTTP server
// =============================================================================

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && url === "/ping") {
      send(res, 200, { ok: true, pid: process.pid, uptime: process.uptime() });
      return;
    }

    if (method === "POST" && url === "/shutdown") {
      send(res, 200, { ok: true });
      // Flush the response, then exit so Electron can spawn a fresh broker
      // off the on-disk broker.cjs. Same handler as SIGTERM (see bottom of
      // file) — leave the socket file for the next broker's clearStaleSocket.
      setTimeout(() => process.exit(0), 50);
      return;
    }

    if (method === "GET" && url === "/sessions") {
      const body: ListSessionsResponse = { ok: true, sessions: listSessions() };
      send(res, 200, body);
      return;
    }

    if (method === "GET" && url.startsWith("/sessions/by-ticket/")) {
      const ticketId = decodeURIComponent(url.slice("/sessions/by-ticket/".length));
      const sessionId = findSessionByTicket(ticketId);
      send(res, 200, { ok: true, sessionId });
      return;
    }

    if (method === "POST" && url === "/start") {
      const body = await readJson<StartRequest>(req);
      if (!body.worktreePath || !body.firstMessage) {
        const r: StartResponse = { ok: false, error: "missing fields" };
        send(res, 400, r);
        return;
      }
      const { sessionId } = startSession({
        worktreePath: body.worktreePath,
        firstMessage: body.firstMessage,
        claudePreamble: body.claudePreamble,
        ticket: body.ticket,
        jobId: body.jobId,
        workflowStepRunId: body.workflowStepRunId,
      });
      const r: StartResponse = { ok: true, sessionId };
      send(res, 200, r);
      return;
    }

    if (method === "POST" && url === "/resume") {
      const body = await readJson<ResumeRequest>(req);
      if (!body.worktreePath || !body.claudeSessionId || !body.message) {
        const r: ResumeResponse = { ok: false, error: "missing fields" };
        send(res, 400, r);
        return;
      }
      const { sessionId } = resumeSession({
        worktreePath: body.worktreePath,
        claudeSessionId: body.claudeSessionId,
        message: body.message,
        claudePreamble: body.claudePreamble,
        ticket: body.ticket,
        jobId: body.jobId,
        workflowStepRunId: body.workflowStepRunId,
      });
      const r: ResumeResponse = { ok: true, sessionId };
      send(res, 200, r);
      return;
    }

    if (method === "POST" && url === "/send") {
      const body = await readJson<SendRequest>(req);
      if (!body.sessionId || !body.message) {
        const r: SendResponse = { ok: false, error: "missing fields" };
        send(res, 400, r);
        return;
      }
      const r = sendToSession(body.sessionId, body.message, body.workflowStepRunId);
      send(res, r.ok ? 200 : 404, r as SendResponse);
      return;
    }

    if (method === "POST" && url === "/stop") {
      const body = await readJson<StopRequest>(req);
      if (!body.sessionId) {
        const r: StopResponse = { ok: false, error: "missing fields" };
        send(res, 400, r);
        return;
      }
      const r = stopSession(body.sessionId);
      send(res, r.ok ? 200 : 404, r as StopResponse);
      return;
    }

    if (method === "POST" && url === "/oneshot") {
      const body = await readJson<OneshotRequest>(req);
      if (!body.prompt) {
        const r: OneshotResponse = { ok: false, error: "missing prompt" };
        send(res, 400, r);
        return;
      }
      const timeoutMs = Math.max(1000, Math.min(60_000, body.timeoutMs ?? 20_000));
      const r = await oneshot(body.prompt, timeoutMs);
      send(res, 200, r as OneshotResponse);
      return;
    }

    if (method === "GET" && url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      // Initial comment so clients know the stream is live.
      res.write(": connected\n\n");
      const unsubscribe = subscribe((ev) => {
        try {
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        } catch {
          // client closed; drain via unsubscribe below
        }
      });
      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {}
      }, 15_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    send(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(res, 500, { ok: false, error: msg });
  }
});

// =============================================================================
// Startup
// =============================================================================

async function main(): Promise<void> {
  await ensureSocketDir();
  await clearStaleSocket();

  const sock = socketPath();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(sock, () => {
      server.off("error", reject);
      resolve();
    });
  });
  // Permissions: only the owner should be able to talk to the broker. The
  // socket path lives under the user's Library so this is defense in depth.
  await fs.chmod(sock, 0o600).catch(() => undefined);
  logLine("broker", "listen", { sock, pid: process.pid });
  process.stdout.write(`broker: listening on ${sock} (pid ${process.pid})\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`broker: fatal ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

// Don't unlink the socket on graceful exit — the next broker will sweep it
// during clearStaleSocket(). Unlinking here races with concurrent connection
// attempts from a quickly-restarting Electron.
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
