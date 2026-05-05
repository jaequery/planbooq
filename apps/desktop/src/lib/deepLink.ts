import type { App } from "electron";
import path from "node:path";

const SCHEME = "planbooq";
let pendingUrl: string | null = null;

export function consumePendingDeepLink(): string | null {
  const u = pendingUrl;
  pendingUrl = null;
  return u;
}

export function registerDeepLinks(app: App, onUrl: (url: string) => void): void {
  // Register protocol handler. argv path needed on Windows when launched from a link.
  const firstArg = process.argv[1];
  if (process.defaultApp && firstArg) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(firstArg)]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }

  // macOS: open-url is the canonical signal.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (!app.isReady()) {
      pendingUrl = url;
      return;
    }
    onUrl(url);
  });

  // Capture URL passed via argv at first launch (Windows / Linux).
  const fromArgv = process.argv.find((a) => a.startsWith(`${SCHEME}://`));
  if (fromArgv) pendingUrl = fromArgv;
}
