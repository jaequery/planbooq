"use client";

import type { AiPanelMessage } from "@prisma/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { confirmToolCall, rejectToolCall } from "@/actions/ai-panel";
import { getCurrentWorkspaceId } from "@/actions/ai-panel-helpers";
import { type PageContext, usePageContext } from "./use-page-context";

export type PanelState = "hidden" | "minimized" | "expanded" | "maximized";

type AiPanelContextValue = {
  state: PanelState;
  setState: (s: PanelState) => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
  ready: boolean;
  conversationId: string | null;
  messages: AiPanelMessage[];
  draftAssistant: string;
  streaming: boolean;
  pageContext: PageContext;
  sendMessage: (text: string) => Promise<void>;
  confirmTool: (messageId: string, args: Record<string, unknown>) => Promise<void>;
  rejectTool: (messageId: string) => Promise<void>;
  panelHeightPx: number;
};

const AiPanelContext = createContext<AiPanelContextValue | null>(null);

const STORAGE_KEY = "ai-panel:state";

function readStoredState(): PanelState {
  if (typeof window === "undefined") return "minimized";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "minimized" || v === "expanded" || v === "maximized") return v;
  } catch {
    // ignore
  }
  return "minimized";
}

function heightForState(state: PanelState): number {
  if (state === "hidden") return 0;
  if (state === "minimized") return 48;
  if (state === "expanded")
    return Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.4);
  return Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.8);
}

export function useAiPanel(): AiPanelContextValue {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel must be used within AiPanelProvider");
  return ctx;
}

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [state, setStateRaw] = useState<PanelState>("hidden");
  const [lastOpenState, setLastOpenState] = useState<PanelState>("minimized");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiPanelMessage[]>([]);
  const [draftAssistant, setDraftAssistant] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [panelHeightPx, setPanelHeightPx] = useState<number>(48);

  const abortRef = useRef<AbortController | null>(null);
  const pageContext = usePageContext(workspaceId);

  // Bootstrap workspace + restore stored panel state.
  useEffect(() => {
    let cancelled = false;
    void getCurrentWorkspaceId().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setUnauthorized(true);
        return;
      }
      setWorkspaceId(res.data.workspaceId);
      const stored = readStoredState();
      setStateRaw(stored);
      setLastOpenState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Bootstrap conversation once workspace is known.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      const { getOrCreateConversation } = await import("@/actions/ai-panel");
      const res = await getOrCreateConversation({ workspaceId });
      if (cancelled) return;
      if (res.ok) {
        setConversationId(res.data.id);
        setMessages(res.data.messages);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const setState = useCallback((s: PanelState) => {
    setStateRaw(s);
    if (s !== "hidden") {
      setLastOpenState(s);
      try {
        window.localStorage.setItem(STORAGE_KEY, s);
      } catch {
        // ignore
      }
    }
  }, []);

  const open = useCallback(() => {
    setState(lastOpenState === "hidden" ? "expanded" : lastOpenState);
  }, [lastOpenState, setState]);

  const close = useCallback(() => {
    setStateRaw("hidden");
  }, []);

  const toggle = useCallback(() => {
    setStateRaw((curr) => {
      if (curr === "hidden" || curr === "minimized") {
        const next = "expanded" as PanelState;
        setLastOpenState(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {}
        return next;
      }
      const next = "minimized" as PanelState;
      setLastOpenState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  // Cmd/Ctrl+J global shortcut.
  useEffect(() => {
    if (unauthorized) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, unauthorized]);

  // Track viewport for height calc.
  useEffect(() => {
    const update = () => setPanelHeightPx(heightForState(state));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [state]);

  // Set CSS var on root.
  useEffect(() => {
    const h = state === "hidden" ? 0 : panelHeightPx;
    document.documentElement.style.setProperty("--ai-panel-height", `${h}px`);
  }, [state, panelHeightPx]);

  // Cleanup any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId || !workspaceId) return;
      if (!text.trim()) return;

      // Optimistic user message.
      const optimisticUser: AiPanelMessage = {
        id: `local-${Date.now()}`,
        conversationId,
        role: "user",
        body: text,
        toolName: null,
        toolArgs: null,
        toolStatus: null,
        toolResult: null,
        pageContext: null,
        createdAt: new Date(),
      };
      setMessages((m) => [...m, optimisticUser]);
      setDraftAssistant("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai-panel/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            conversationId,
            message: text,
            pageContext: {
              workspaceId,
              projectId: pageContext.projectId ?? undefined,
              ticketId: pageContext.ticketId ?? undefined,
            },
          }),
        });

        if (!res.ok || !res.body) {
          toast.error("AI request failed");
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantBuf = "";
        const toolMessages: AiPanelMessage[] = [];

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf("\n");
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              if (evt.type === "delta" && typeof evt.text === "string") {
                assistantBuf += evt.text;
                setDraftAssistant(assistantBuf);
              } else if (evt.type === "tool_call") {
                const toolMsg: AiPanelMessage = {
                  id: evt.messageId,
                  conversationId,
                  role: "tool",
                  body: "",
                  toolName: evt.name,
                  toolArgs: evt.args ?? {},
                  toolStatus: "pending",
                  toolResult: null,
                  pageContext: null,
                  createdAt: new Date(),
                };
                toolMessages.push(toolMsg);
                setMessages((m) => [...m, toolMsg]);
              } else if (evt.type === "error") {
                toast.error(evt.message ?? "AI error");
              } else if (evt.type === "done") {
                // handled after loop
              }
            } catch {
              // ignore malformed line
            }
          }
        }

        // Finalize assistant message if any text.
        if (assistantBuf.trim()) {
          const finalMsg: AiPanelMessage = {
            id: `assist-${Date.now()}`,
            conversationId,
            role: "assistant",
            body: assistantBuf,
            toolName: null,
            toolArgs: null,
            toolStatus: null,
            toolResult: null,
            pageContext: null,
            createdAt: new Date(),
          };
          setMessages((m) => [...m, finalMsg]);
        }
        setDraftAssistant("");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error("AI stream interrupted");
        }
      } finally {
        setStreaming(false);
      }
    },
    [conversationId, workspaceId, pageContext.projectId, pageContext.ticketId],
  );

  const confirmTool = useCallback(async (messageId: string, args: Record<string, unknown>) => {
    const res = await confirmToolCall({ messageId, args });
    if (res.ok) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                toolStatus: "executed",
                toolResult: res.data as unknown as AiPanelMessage["toolResult"],
              }
            : msg,
        ),
      );
      const url = (res.data as { url?: string }).url;
      const kind = (res.data as { kind?: string }).kind ?? "item";
      if (url) {
        toast.success(`Created ${kind}`, {
          action: { label: "Open", onClick: () => window.open(url, "_self") },
        });
      } else {
        toast.success(`Created ${kind}`);
      }
    } else {
      toast.error(res.error || "Failed");
    }
  }, []);

  const rejectTool = useCallback(async (messageId: string) => {
    const res = await rejectToolCall({ messageId });
    if (res.ok) {
      setMessages((m) =>
        m.map((msg) => (msg.id === messageId ? { ...msg, toolStatus: "rejected" } : msg)),
      );
    } else {
      toast.error(res.error || "Failed");
    }
  }, []);

  const value = useMemo<AiPanelContextValue>(
    () => ({
      state,
      setState,
      toggle,
      open,
      close,
      ready: !unauthorized && workspaceId !== null,
      conversationId,
      messages,
      draftAssistant,
      streaming,
      pageContext,
      sendMessage,
      confirmTool,
      rejectTool,
      panelHeightPx,
    }),
    [
      state,
      setState,
      toggle,
      open,
      close,
      unauthorized,
      workspaceId,
      conversationId,
      messages,
      draftAssistant,
      streaming,
      pageContext,
      sendMessage,
      confirmTool,
      rejectTool,
      panelHeightPx,
    ],
  );

  if (unauthorized) {
    // Don't render the panel context for unauth pages — but still provide
    // a minimal no-op context so child consumers don't crash.
    return <>{children}</>;
  }

  return <AiPanelContext.Provider value={value}>{children}</AiPanelContext.Provider>;
}

export function useOptionalAiPanel(): AiPanelContextValue | null {
  return useContext(AiPanelContext);
}
