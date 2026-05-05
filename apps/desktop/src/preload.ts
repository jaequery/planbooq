import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("planbooq", {
  spawnWorktree: (input: { repoPath: string; branch: string; prompt: string }) =>
    ipcRenderer.invoke("planbooq:worktree:spawn", input),
  pickRepoPath: () => ipcRenderer.invoke("planbooq:worktree:pickRepo"),
  onWorktreeLog: (cb: (line: string) => void) => {
    const listener = (_: unknown, line: string) => cb(line);
    ipcRenderer.on("planbooq:worktree:log", listener);
    return () => ipcRenderer.removeListener("planbooq:worktree:log", listener);
  },
  setAblyToken: (token: string, channel: string) =>
    ipcRenderer.invoke("planbooq:notifications:setToken", { token, channel }),
  setUnreadCount: (count: number) =>
    ipcRenderer.invoke("planbooq:tray:setUnread", count),
  agentStart: (input: { repoPath: string; branch: string; firstMessage: string }) =>
    ipcRenderer.invoke("planbooq:agent:start", input),
  agentResume: (input: { worktreePath: string; claudeSessionId: string; message: string }) =>
    ipcRenderer.invoke("planbooq:agent:resume", input),
  agentSend: (input: { sessionId: string; message: string }) =>
    ipcRenderer.invoke("planbooq:agent:send", input),
  agentStop: (input: { sessionId: string }) => ipcRenderer.invoke("planbooq:agent:stop", input),
  onAgentEvent: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, e: unknown) => cb(e);
    ipcRenderer.on("planbooq:agent:event", listener);
    return () => ipcRenderer.removeListener("planbooq:agent:event", listener);
  },
});
