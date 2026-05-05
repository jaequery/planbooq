"use client";

import { Folder, Loader2, Play, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { dispatchTicketToAgent, listAgents } from "@/actions/agents";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { type AgentEvent, getDesktopBridge, useIsDesktop } from "@/lib/use-is-desktop";

type Job = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  output: string;
  exitCode: number | null;
  error: string | null;
  createdAt: string;
  agent: { id: string; name: string; hostname: string | null } | null;
};

type Agent = { id: string; name: string; hostname: string | null; revokedAt: Date | null };

type Props = {
  ticketId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
};

export function TicketAgentPanel(props: Props): React.ReactElement {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopPanel {...props} /> : <WebPanel {...props} />;
}

function repoKey(projectId: string): string {
  return `planbooq:repoPath:project:${projectId}`;
}

function chatKey(ticketId: string): string {
  return `planbooq:chat:${ticketId}`;
}

type ChatMsg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "system"; text: string };

type AssistantBlock = { type: string; text?: string };
type StreamDelta = { type?: string; text?: string };
type StreamInner = {
  type?: string;
  delta?: StreamDelta;
  content_block?: { type?: string; text?: string };
};
type ParsedEvent = {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: AssistantBlock[] };
  event?: StreamInner;
};

type PersistedChat = {
  messages: ChatMsg[];
  worktreePath: string | null;
  claudeSessionId: string | null;
};

function DesktopPanel({ ticketId, projectId, title, description }: Props): React.ReactElement {
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentAssistantId = useRef<string | null>(null);

  useEffect(() => {
    setRepoPath(localStorage.getItem(repoKey(projectId)));
  }, [projectId]);

  // Hydrate persisted chat for this ticket.
  useEffect(() => {
    setHydrated(false);
    const raw = localStorage.getItem(chatKey(ticketId));
    if (raw) {
      try {
        const persisted = JSON.parse(raw) as PersistedChat;
        setMessages(persisted.messages ?? []);
        setWorktreePath(persisted.worktreePath ?? null);
        setClaudeSessionId(persisted.claudeSessionId ?? null);
      } catch {}
    } else {
      setMessages([]);
      setWorktreePath(null);
      setClaudeSessionId(null);
    }
    setSessionId(null);
    setBusy(false);
    currentAssistantId.current = null;
    setHydrated(true);
  }, [ticketId]);

  // Persist on changes (skip until hydrated to avoid clobbering with empty state).
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0 && !worktreePath && !claudeSessionId) {
      localStorage.removeItem(chatKey(ticketId));
      return;
    }
    const persisted: PersistedChat = { messages, worktreePath, claudeSessionId };
    localStorage.setItem(chatKey(ticketId), JSON.stringify(persisted));
  }, [hydrated, ticketId, messages, worktreePath, claudeSessionId]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || typeof bridge.onAgentEvent !== "function") return;
    return bridge.onAgentEvent((e: AgentEvent) => {
      if (e.type === "exit") {
        setBusy(false);
        setSessionId(null);
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "system", text: `Session ended (exit ${e.code})` },
        ]);
        return;
      }
      if (e.type === "stderr") {
        // stderr is mostly git progress; surface only if it looks like an error
        if (/error|fatal|fail/i.test(e.line)) {
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "system", text: e.line.trim() },
          ]);
        }
        return;
      }
      // e.type === "agent" — JSON line from claude --output-format stream-json
      let parsed: ParsedEvent | null = null;
      try {
        parsed = JSON.parse(e.line) as ParsedEvent;
      } catch {
        return;
      }
      const appendAssistant = (text: string, replace = false) => {
        if (!text) return;
        setMessages((m) => {
          const id = currentAssistantId.current;
          if (id && m.length > 0 && m[m.length - 1]!.id === id) {
            const next = m.slice();
            const last = next[next.length - 1]!;
            next[next.length - 1] = {
              ...last,
              text: replace ? text : last.text + text,
            } as ChatMsg;
            return next;
          }
          const newId = crypto.randomUUID();
          currentAssistantId.current = newId;
          return [...m, { id: newId, role: "assistant", text }];
        });
      };

      if (parsed.type === "stream_event" && parsed.event) {
        const ev = parsed.event;
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          appendAssistant(ev.delta.text ?? "");
        } else if (ev.type === "content_block_start" && ev.content_block?.type === "text") {
          // Starts a new text block — reset accumulator boundary
          if (ev.content_block.text) appendAssistant(ev.content_block.text);
        } else if (ev.type === "message_stop") {
          currentAssistantId.current = null;
        }
      } else if (parsed.type === "assistant" && parsed.message) {
        // Final assistant message arrives at end of turn. Replace the streamed
        // bubble if we already have one for this turn so we don't duplicate.
        const blocks: AssistantBlock[] = parsed.message.content ?? [];
        const text = blocks
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");
        if (text) appendAssistant(text, currentAssistantId.current !== null);
      } else if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
        setClaudeSessionId(parsed.session_id);
      } else if (parsed.type === "result") {
        currentAssistantId.current = null;
        setBusy(false);
      }
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const pickRepo = async (): Promise<string | null> => {
    const bridge = getDesktopBridge();
    if (!bridge) return null;
    const result = await bridge.pickRepoPath();
    if (!result.ok || !result.path) {
      if (result.error) toast.error(result.error);
      return null;
    }
    localStorage.setItem(repoKey(projectId), result.path);
    setRepoPath(result.path);
    return result.path;
  };

  const send = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const message = input.trim();
    if (!message) return;

    if (typeof bridge.agentStart !== "function" || typeof bridge.agentSend !== "function") {
      toast.error("Desktop app is out of date — quit and relaunch Planbooq");
      return;
    }

    if (!sessionId) {
      // Cold start: either resume a prior conversation in an existing worktree,
      // or create a fresh worktree + first turn.
      const canResume =
        !!worktreePath && !!claudeSessionId && typeof bridge.agentResume === "function";
      setBusy(true);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: message }]);
      setInput("");

      if (canResume) {
        try {
          const res = await bridge.agentResume({
            worktreePath: worktreePath!,
            claudeSessionId: claudeSessionId!,
            message,
          });
          if (!res.ok || !res.sessionId) {
            toast.error(res.error ?? "Resume failed");
            setBusy(false);
            return;
          }
          setSessionId(res.sessionId);
          return;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Resume failed");
          setBusy(false);
          return;
        }
      }

      if (!repoPath) {
        toast.error("Pick a project folder first");
        setBusy(false);
        return;
      }
      const path = repoPath;
      const seed = [`# ${title}`, description ?? "", "", message]
        .filter((s) => s !== "")
        .join("\n\n")
        .trim();
      const branch = `pbq-${ticketId.slice(0, 8)}-${Date.now().toString(36)}`;
      let res: Awaited<ReturnType<typeof bridge.agentStart>>;
      try {
        res = await bridge.agentStart({ repoPath: path, branch, firstMessage: seed });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No handler registered")) {
          toast.error("Desktop app is out of date — fully quit and relaunch Planbooq");
        } else {
          toast.error(msg);
        }
        setBusy(false);
        return;
      }
      if (!res.ok || !res.sessionId) {
        toast.error(res.error ?? "Failed to start session");
        setBusy(false);
        return;
      }
      setSessionId(res.sessionId);
      setWorktreePath(res.worktreePath ?? null);
      return;
    }

    setBusy(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: message }]);
    setInput("");
    try {
      const res = await bridge.agentSend({ sessionId, message });
      if (!res.ok) {
        toast.error(res.error ?? "Send failed");
        setBusy(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
      setBusy(false);
    }
  };

  const stop = async () => {
    const bridge = getDesktopBridge();
    if (!bridge || !sessionId) return;
    await bridge.agentStop({ sessionId });
  };

  if (!repoPath) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Claude Code</h3>
        <div className="flex flex-col items-center gap-3 rounded border border-dashed bg-muted/10 px-6 py-8 text-center">
          <Button size="sm" onClick={pickRepo}>
            <Folder className="size-4" />
            Choose Folder
          </Button>
          <p className="max-w-sm text-[12px] text-muted-foreground">
            Choose this project's folder so Claude Code has a repo to work in. The folder is
            remembered per project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">
          Claude Code
          {worktreePath && (
            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
              {worktreePath.split("/").pop()}
            </span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={pickRepo} disabled={!!sessionId}>
          <Folder className="size-4" />
          {repoPath.split("/").pop()}
        </Button>
        {sessionId && (
          <Button size="sm" variant="outline" onClick={stop}>
            <Square className="size-4" />
            Stop
          </Button>
        )}
      </div>

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded border bg-muted/10 p-3"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-[13px] whitespace-pre-wrap"
                  : m.role === "system"
                    ? "self-center text-[11px] text-muted-foreground"
                    : "self-start max-w-[85%] rounded-lg bg-background px-3 py-2"
              }
            >
              {m.role === "assistant" ? (
                <Markdown className="text-[13px]">{m.text}</Markdown>
              ) : (
                m.text
              )}
            </div>
          ))}
          {busy && (
            <div className="self-start text-[12px] text-muted-foreground">
              <Loader2 className="inline size-3 animate-spin" /> thinking…
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            sessionId ? "Reply to Claude…" : `Start a session — first message will include "${title}"`
          }
          rows={2}
          className="min-h-[60px] flex-1 resize-y rounded border bg-background px-3 py-2 text-[13px]"
        />
        <Button size="sm" onClick={send} disabled={busy || !input.trim()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : sessionId ? (
            <Send className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {sessionId ? "Send" : "Start"}
        </Button>
      </div>
    </div>
  );
}

function WebPanel({ ticketId, workspaceId }: Props): React.ReactElement {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listAgents({ workspaceId }).then((res) => {
      if (res.ok) {
        const live = res.data.filter((a) => !a.revokedAt);
        setAgents(live);
        if (live.length > 0) setSelectedAgent(live[0]!.id);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/jobs`, { cache: "no-store" });
        const body = await res.json();
        if (!stopped && body.ok) setJobs(body.data);
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 2500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [ticketId]);

  const dispatch = () => {
    if (!selectedAgent) return;
    startTransition(async () => {
      const res = await dispatchTicketToAgent({ ticketId, agentId: selectedAgent });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dispatched");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Run on a machine</h3>
        <select
          className="min-w-[200px] rounded border bg-background px-2 py-1 text-sm"
          value={selectedAgent ?? ""}
          onChange={(e) => setSelectedAgent(e.target.value || null)}
          disabled={agents.length === 0}
        >
          {agents.length === 0 && <option value="">No agents paired</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.hostname ? `· ${a.hostname}` : ""}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={dispatch} disabled={!selectedAgent || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run
        </Button>
      </div>
      {agents.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Pair a machine in <code>Settings → Agents</code> to dispatch this ticket to your local
          Claude Code.
        </p>
      )}
      {jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          {jobs.slice(0, 3).map((j) => (
            <details
              key={j.id}
              className="rounded border bg-muted/20 p-2 text-xs"
              open={j.status === "RUNNING" || j.status === "PENDING"}
            >
              <summary className="cursor-pointer select-none">
                <span className="font-mono">{j.status}</span>
                {j.agent && <span className="ml-2">on {j.agent.name}</span>}
                <span className="ml-2 text-muted-foreground">
                  {new Date(j.createdAt).toLocaleString()}
                </span>
                {typeof j.exitCode === "number" && (
                  <span className="ml-2 text-muted-foreground">exit {j.exitCode}</span>
                )}
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                {j.output || "(no output yet)"}
                {j.error ? `\n\n[error] ${j.error}` : ""}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
