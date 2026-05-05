import { app, BrowserWindow, shell, Menu } from "electron";
import path from "node:path";
import log from "electron-log/main";
import { registerDeepLinks, consumePendingDeepLink } from "./lib/deepLink";
import { createTray, destroyTray } from "./lib/tray";
import { startNotificationBridge, stopNotificationBridge } from "./lib/notifications";
import { registerWorktreeIpc } from "./lib/worktree";
import { registerAgentIpc } from "./lib/agent";
import { initAutoUpdater } from "./lib/updater";
import { buildAppMenu } from "./lib/menu";

if (require("electron-squirrel-startup")) app.quit();

log.initialize();
log.transports.file.level = "info";

const APP_URL = process.env.PLANBOOQ_APP_URL ?? (app.isPackaged ? "https://app.planbooq.com" : "http://localhost:3636");

let mainWindow: BrowserWindow | null = null;

function resolveTargetUrl(deepLink: string | null): string {
  if (!deepLink) return APP_URL;
  // planbooq://ticket/abc123 → APP_URL/ticket/abc123
  try {
    const u = new URL(deepLink);
    const pathPart = `${u.host}${u.pathname}`.replace(/\/+$/, "");
    const search = u.search ?? "";
    return `${APP_URL.replace(/\/+$/, "")}/${pathPart}${search}`;
  } catch {
    return APP_URL;
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0b0b0c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Externals (different origin) open in default browser; same-origin stays in-window.
  const isInternal = (target: string) => {
    try {
      const a = new URL(target);
      const b = new URL(APP_URL);
      return a.origin === b.origin;
    } catch {
      return false;
    }
  };

  // window.open / target="_blank": always pop external links into the system browser.
  // Internal popups stay in the same Electron session.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Top-level navigation (including OAuth round-trips) stays in-window so cookies
  // and PKCE verifiers stay in one session. Linear and Slack both behave this way.
  // No will-navigate redirect to the system browser.

  win.loadURL(resolveTargetUrl(consumePendingDeepLink())).catch((err) => {
    log.error("loadURL failed", err);
  });

  return win;
}

function focusMain(deepLink?: string) {
  if (!mainWindow) {
    mainWindow = createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (deepLink) mainWindow.loadURL(resolveTargetUrl(deepLink)).catch(() => {});
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const dl = argv.find((a) => a.startsWith("planbooq://")) ?? null;
    focusMain(dl ?? undefined);
  });

  registerDeepLinks(app, (url) => focusMain(url));
  registerWorktreeIpc();
  registerAgentIpc();

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildAppMenu(() => focusMain()));
    mainWindow = createWindow();
    createTray(() => focusMain());
    startNotificationBridge((url) => focusMain(url));
    initAutoUpdater();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    else focusMain();
  });

  app.on("before-quit", () => {
    stopNotificationBridge();
    destroyTray();
  });
}
