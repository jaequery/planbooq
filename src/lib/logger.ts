type LogLevel = "info" | "warn" | "error";

// Lazy-initialized file sink: appends every log line as JSONL to
// .planbooq/logs/server.log so an AI agent or human can grep server-side
// diagnostics post-hoc without needing the dev server's stdout.
//
// The fs/path imports are loaded via an indirect-eval'd require so the
// bundler never sees a static `node:fs` reference. Without this trick,
// Turbopack refuses to build because the logger transitively reaches the
// client bundle through `use-board-channel.ts`. The runtime guard
// (`typeof window === "undefined"`) ensures we never even attempt the
// require in a browser context.
type FileSink = (line: string) => void;
let fileSinkCache: FileSink | null | undefined;

function nodeRequire<T = unknown>(name: string): T | null {
  // Prefer process.getBuiltinModule (Node 22+) — it's purpose-built for
  // loading built-ins from ESM contexts and is invisible to bundlers.
  try {
    const proc = (typeof process !== "undefined" ? process : null) as
      | (NodeJS.Process & { getBuiltinModule?: (id: string) => unknown })
      | null;
    if (proc?.getBuiltinModule) {
      const mod = proc.getBuiltinModule(name);
      if (mod) return mod as T;
    }
  } catch {
    // fall through
  }
  // CJS fallback (Next.js server bundle): obtain `require` via indirect eval
  // so the bundler never statically resolves the import. In the browser, the
  // eval expression returns null and we fall through.
  try {
    // eslint-disable-next-line no-eval
    const req = (0, eval)("typeof require === 'function' ? require : null") as NodeRequire | null;
    return req ? (req(name) as T) : null;
  } catch {
    return null;
  }
}

function shouldLogToFile(): boolean {
  if (typeof window !== "undefined") return false;
  if (typeof process === "undefined" || !process.versions?.node) return false;
  if (process.env.PLANBOOQ_LOG_TO_FILE === "0") return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.PLANBOOQ_LOG_TO_FILE === "1";
  }
  return true;
}

function buildFileSink(): FileSink | null {
  if (!shouldLogToFile()) return null;
  const fs = nodeRequire<typeof import("node:fs")>("node:fs");
  const path = nodeRequire<typeof import("node:path")>("node:path");
  if (!fs || !path) return null;
  try {
    const dir = path.resolve(process.cwd(), ".planbooq", "logs");
    const file = path.join(dir, "server.log");
    fs.mkdirSync(dir, { recursive: true });
    return (line: string) => {
      // Fire-and-forget append. Errors are swallowed; we never want logging
      // to break a request path.
      fs.appendFile(file, `${line}\n`, () => {});
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
