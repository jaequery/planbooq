import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("planbooq", {
  spawnWorktree: (input: {
    repoPath: string;
    branch: string;
    prompt: string;
    ticketIdentifier: string;
  }) => ipcRenderer.invoke("planbooq:worktree:spawn", input),
  pickRepoPath: () => ipcRenderer.invoke("planbooq:worktree:pickRepo"),
  onWorktreeLog: (cb: (line: string) => void) => {
    const listener = (_: unknown, line: string) => cb(line);
    ipcRenderer.on("planbooq:worktree:log", listener);
    return () => ipcRenderer.removeListener("planbooq:worktree:log", listener);
  },
  setAblyToken: (token: string, channel: string) =>
    ipcRenderer.invoke("planbooq:notifications:setToken", { token, channel }),
  setUnreadCount: (count: number) => ipcRenderer.invoke("planbooq:tray:setUnread", count),
  agentStart: (input: {
    repoPath: string;
    branch: string;
    firstMessage: string;
    ticket?: {
      ticketId: string;
      identifier: string;
      title: string;
      apiBaseUrl: string;
      apiToken: string;
    };
    attachments?: Array<{ id: string; ext: string; base64: string }>;
    jobId?: string;
    workflowStepRunId?: string | null;
  }) => ipcRenderer.invoke("planbooq:agent:start", input),
  agentResume: (input: {
    worktreePath: string;
    claudeSessionId: string;
    message: string;
    ticket?: {
      ticketId: string;
      identifier: string;
      title: string;
      apiBaseUrl: string;
      apiToken: string;
    };
    jobId?: string;
    workflowStepRunId?: string | null;
  }) => ipcRenderer.invoke("planbooq:agent:resume", input),
  agentSend: (input: { sessionId: string; message: string; workflowStepRunId?: string | null }) =>
    ipcRenderer.invoke("planbooq:agent:send", input),
  agentStop: (input: { sessionId: string }) => ipcRenderer.invoke("planbooq:agent:stop", input),
  agentOneshot: (input: { prompt: string; timeoutMs?: number }) =>
    ipcRenderer.invoke("planbooq:agent:oneshot", input),
  agentFindSessionByTicket: (input: { ticketId: string }) =>
    ipcRenderer.invoke("planbooq:agent:findSessionByTicket", input),
  readProjectFile: (input: { repoPath: string; relPath: string }) =>
    ipcRenderer.invoke("planbooq:files:read", input),
  writeProjectFile: (input: { repoPath: string; relPath: string; content: string }) =>
    ipcRenderer.invoke("planbooq:files:write", input),
  saveClipboardImage: (input: { dataBase64: string; ext: string }) =>
    ipcRenderer.invoke("planbooq:files:saveClipboardImage", input),
  writeAttachments: (input: {
    worktreePath: string;
    items: Array<{ id: string; ext: string; base64: string }>;
  }) => ipcRenderer.invoke("planbooq:files:writeAttachments", input),
  pullMain: (input: { repoPath: string }) => ipcRenderer.invoke("planbooq:git:pullMain", input),
  onAgentEvent: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, e: unknown) => cb(e);
    ipcRenderer.on("planbooq:agent:event", listener);
    return () => ipcRenderer.removeListener("planbooq:agent:event", listener);
  },
});
