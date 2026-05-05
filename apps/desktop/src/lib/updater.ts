import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log/main";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function initAutoUpdater(): void {
  if (!app.isPackaged) return; // dev: skip
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => log.error("updater error", err));
  autoUpdater.on("update-available", (info) => log.info("update available", info.version));
  autoUpdater.on("update-not-available", () => log.info("up to date"));
  autoUpdater.on("update-downloaded", async (info) => {
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      title: "Update ready",
      message: `Planbooq ${info.version} is ready to install.`,
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  void autoUpdater.checkForUpdatesAndNotify().catch((err) => log.warn("initial check failed", err));
  setInterval(() => {
    void autoUpdater.checkForUpdates().catch((err) => log.warn("periodic check failed", err));
  }, CHECK_INTERVAL_MS);
}
