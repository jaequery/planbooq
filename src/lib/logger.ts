import { appendFile, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

type LogLevel = "info" | "warn" | "error";

// Lazy-initialized file sink: appends every log line as JSONL to
// .planbooq/logs/server.log so an AI agent or human can grep server-side
// diagnostics post-hoc without needing the dev server's stdout.
type FileSink = (line: string) => void;
let fileSinkCache: FileSink | null | undefined;

function shouldLogToFile(): boolean {
  if (typeof process === "undefined" || !process.versions?.node) return false;
  if (process.env.PLANBOOQ_LOG_TO_FILE === "0") return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.PLANBOOQ_LOG_TO_FILE === "1";
  }
  return true;
}

function buildFileSink(): FileSink | null {
  if (!shouldLogToFile()) return null;
  try {
    const dir = resolve(process.cwd(), ".planbooq", "logs");
    const file = join(dir, "server.log");
    mkdirSync(dir, { recursive: true });
    return (line: string) => {
      // Fire-and-forget append. Errors are swallowed; we never want logging
      // to break a request path.
      appendFile(file, `${line}\n`, () => {});
    };
  } catch {
    return null;
  }
}

function getFileSink(): FileSink | null {
  if (fileSinkCache === undefined) {
    fileSinkCache = buildFileSink();
  }
  return fileSinkCache ?? null;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  };
  const line = JSON.stringify(payload);
  // Route by level so dev overlays don't surface info/warn as Console Errors.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  const sink = getFileSink();
  if (sink) sink(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => emit("error", message, meta),
};
