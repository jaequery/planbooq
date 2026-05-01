import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOpenRouterApiKey } from "@/server/openrouter";
import {
  AI_PANEL_HISTORY_LIMIT,
  AI_PANEL_MAX_BODY,
  AI_PANEL_MODEL,
  appendAssistantMessageSvc,
  appendUserMessageSvc,
} from "@/server/services/ai-panel";
import { AI_PANEL_TOOLS } from "@/server/services/ai-panel-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    conversationId: z.string().min(1),
    message: z.string().min(1).max(AI_PANEL_MAX_BODY),
    pageContext: z
      .object({
        workspaceId: z.string().min(1),
        projectId: z.string().min(1).optional(),
        ticketId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CollectedToolCall = {
  index: number;
  id?: string;
  name?: string;
  argsBuffer: string;
};

const SYSTEM_PROMPT = [
  "You are the Planbooq workspace assistant. You help the user manage their workspace from a side panel.",
  "You can call tools to take actions:",
  "- create_ticket(projectId?, title, description?) — projectId is OPTIONAL; if omitted it defaults to the user's current page context (pageContext.projectId).",
  "- create_project(name, color?, description?) — creates a project in the user's current workspace.",
  "When a tool requires a project and neither the user nor the page context provides one, ask the user which project to use instead of guessing.",
  "Page context is provided in each user turn — use it to default tool args.",
  "Answer concisely. Prefer tool calls over describing what you would do.",
].join(" ");

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsedBody: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    parsedBody = BodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const conversation = await prisma.aiConversation.findUnique({
    where: { id: parsedBody.conversationId },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }
  if (conversation.userId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (conversation.workspaceId !== parsedBody.pageContext.workspaceId) {
    return NextResponse.json({ error: "workspace_mismatch" }, { status: 400 });
  }
  const member = await prisma.member.findUnique({
    where: {
      workspaceId_userId: { workspaceId: conversation.workspaceId, userId },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Persist user message
  await appendUserMessageSvc({
    userId,
    conversationId: conversation.id,
    body: parsedBody.message,
    pageContext: parsedBody.pageContext,
  });

  // Build OpenRouter messages from history
  const history = await prisma.aiPanelMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: AI_PANEL_HISTORY_LIMIT,
  });
  const messages: OpenRouterMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  messages.push({
    role: "system",
    content: `Page context: ${JSON.stringify(parsedBody.pageContext)}`,
  });
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      if (m.body) messages.push({ role: m.role, content: m.body });
    } else if (m.role === "tool" && m.toolName) {
      const status = m.toolStatus ?? "pending";
      messages.push({
        role: "system",
        content: `Tool ${m.toolName} ${status}${
          m.toolResult ? ` → ${JSON.stringify(m.toolResult).slice(0, 300)}` : ""
        }`,
      });
    }
  }

  const apiKey = await getOpenRouterApiKey(conversation.workspaceId);
  if (!apiKey) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(ndjson({ type: "error", message: "no_openrouter_key" }));
        controller.enqueue(ndjson({ type: "done" }));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  }

  const upstreamAbort = new AbortController();
  req.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true });

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";
      const toolCalls = new Map<number, CollectedToolCall>();
      let finishedTools: Array<{ name: string; args: object }> = [];
      let upstreamRes: Response;

      try {
        upstreamRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: upstreamAbort.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "Planbooq",
          },
          body: JSON.stringify({
            model: AI_PANEL_MODEL,
            messages,
            tools: AI_PANEL_TOOLS,
            tool_choice: "auto",
            stream: true,
          }),
        });
      } catch (e) {
        controller.enqueue(
          ndjson({
            type: "error",
            message: e instanceof Error ? e.message : "fetch_failed",
          }),
        );
        controller.enqueue(ndjson({ type: "done" }));
        controller.close();
        return;
      }

      if (!upstreamRes.ok || !upstreamRes.body) {
        const text = await upstreamRes.text().catch(() => "");
        controller.enqueue(
          ndjson({
            type: "error",
            message: `openrouter_${upstreamRes.status}`,
            detail: text.slice(0, 200),
          }),
        );
        controller.enqueue(ndjson({ type: "done" }));
        controller.close();
        return;
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          // biome-ignore lint/suspicious/noAssignInExpressions: SSE parse loop
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (!line?.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;

            let chunk: {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            };
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }

            const choice = chunk.choices?.[0];
            const delta = choice?.delta;
            if (delta?.content) {
              assistantText += delta.content;
              controller.enqueue(ndjson({ type: "delta", text: delta.content }));
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.get(tc.index) ?? {
                  index: tc.index,
                  argsBuffer: "",
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.argsBuffer += tc.function.arguments;
                }
                toolCalls.set(tc.index, existing);
              }
            }
          }
        }
      } catch (e) {
        logger.warn("ai-panel.stream.upstream_read_failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Finalize tool calls
      finishedTools = Array.from(toolCalls.values())
        .filter((c) => c.name)
        .map((c) => {
          let parsed: object = {};
          if (c.argsBuffer) {
            try {
              const obj = JSON.parse(c.argsBuffer);
              if (obj && typeof obj === "object") parsed = obj as object;
            } catch {
              parsed = { _raw: c.argsBuffer.slice(0, 1000) };
            }
          }
          return { name: c.name as string, args: parsed };
        });

      // Persist assistant turn (and tool rows) BEFORE emitting tool_call events
      try {
        const persisted = await appendAssistantMessageSvc({
          conversationId: conversation.id,
          body: assistantText,
          toolCalls: finishedTools.length > 0 ? finishedTools : undefined,
        });
        for (let i = 0; i < persisted.toolMessages.length; i++) {
          const tm = persisted.toolMessages[i];
          const call = finishedTools[i];
          if (!tm || !call) continue;
          controller.enqueue(
            ndjson({
              type: "tool_call",
              messageId: tm.id,
              name: call.name,
              args: call.args,
            }),
          );
        }
      } catch (e) {
        logger.error("ai-panel.stream.persist_failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        controller.enqueue(ndjson({ type: "error", message: "persist_failed" }));
      }

      controller.enqueue(ndjson({ type: "done" }));
      controller.close();
    },
    cancel() {
      upstreamAbort.abort();
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
