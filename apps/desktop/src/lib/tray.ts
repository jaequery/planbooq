import { Tray, Menu, nativeImage, app, ipcMain } from "electron";
import path from "node:path";

let tray: Tray | null = null;
let unread = 0;

function buildIcon(count: number) {
  // Template image keeps tray icon mac-native (auto inverts in dark mode).
  const iconPath = path.join(__dirname, "../renderer/assets/tray-icon.png");
  const img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) img.setTemplateImage(true);
  return img;
}

export function createTray(onShow: () => void): void {
  tray = new Tray(buildIcon(0));
  tray.setToolTip("Planbooq");
  const refresh = () => {
    if (!tray) return;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: unread > 0 ? `${unread} unread` : "No new updates",
          enabled: false,
        },
        { type: "separator" },
        { label: "Show Planbooq", click: onShow },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    tray.setTitle(unread > 0 ? `● ${unread}` : "");
  };
  refresh();
  tray.on("click", onShow);

  ipcMain.handle("planbooq:tray:setUnread", (_, count: number) => {
    unread = Math.max(0, Number(count) || 0);
    refresh();
    if (process.platform === "darwin") app.dock?.setBadge(unread > 0 ? String(unread) : "");
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
