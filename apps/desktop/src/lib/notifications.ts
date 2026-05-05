import { Notification, ipcMain } from "electron";
import * as Ably from "ably";
import log from "electron-log/main";

let client: Ably.Realtime | null = null;
let channelName: string | null = null;
let onActivate: ((url: string) => void) | null = null;

interface AblyEventPayload {
  type?: string;
  ticketId?: string;
  variantId?: string;
  title?: string;
  body?: string;
}

function notifyFor(payload: AblyEventPayload) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: payload.title ?? "Planbooq",
    body: payload.body ?? payload.type ?? "Update",
    silent: false,
  });
  n.on("click", () => {
    if (!onActivate) return;
    if (payload.ticketId) {
      const url = payload.variantId
        ? `planbooq://ticket/${payload.ticketId}/variant/${payload.variantId}`
        : `planbooq://ticket/${payload.ticketId}`;
      onActivate(url);
    } else {
      onActivate("planbooq://");
    }
  });
  n.show();
}

async function connect(token: string, channel: string) {
  await disconnect();
  channelName = channel;
  client = new Ably.Realtime({ token, autoConnect: true });
  client.connection.on("failed", (err) => log.warn("ably failed", err));
  const ch = client.channels.get(channel);
  await ch.subscribe((msg) => {
    try {
      const data = (msg.data ?? {}) as AblyEventPayload;
      if (data.type && /ready|completed|review/i.test(data.type)) notifyFor(data);
    } catch (err) {
      log.warn("notif parse", err);
    }
  });
  log.info("ably bridge connected", channel);
}

async function disconnect() {
  if (client && channelName) {
    try {
      await client.channels.get(channelName).detach();
    } catch {}
  }
  client?.close();
  client = null;
  channelName = null;
}

export function startNotificationBridge(activate: (url: string) => void): void {
  onActivate = activate;
  ipcMain.handle("planbooq:notifications:setToken", async (_, args: { token: string; channel: string }) => {
    if (!args?.token || !args?.channel) return { ok: false, error: "missing token or channel" };
    try {
      await connect(args.token, args.channel);
      return { ok: true };
    } catch (err) {
      log.error("ably connect failed", err);
      return { ok: false, error: (err as Error).message };
    }
  });
}

export function stopNotificationBridge(): void {
  void disconnect();
}
