import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOpenRouterApiKey } from "@/server/openrouter";
import { createCommentSvc } from "@/server/services/comments";
import { mirrorAppendOutput, mirrorJobTerminal } from "@/server/services/mirror-agent-job";
import { moveTicketToStatusKey } from "@/server/services/ticket-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Delta = { choices?: Array<{ delta?: { content?: string } }> };

/**
 * POST /api/tickets/:id/plan
 * Streams the OpenRouter response back as plain text chunks AND mirrors every
 * chunk into an AgentJob row (kind=PLAN), so closing the ticket mid-stream and
 * reopening replays the partial output. Realtime fanout via `agent.delta` lets
 * the client switch from POST-stream reading to Ably subscription on rehydrate.
 *
 * On completion: writes the accumulated content into Ticket.plan, comments,
 * and transitions the ticket to "todo".
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      title: true,
      description: true,
      archivedAt: true,
    },
  });
  if (!ticket || ticket.archivedAt) {
    return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
  }
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId: ticket.workspaceId, userId } },
  });
  if (!member) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const apiKey = await getOpenRouterApiKey(ticket.workspaceId);
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "no_key" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: { description: true, techStack: true },
  });
  const projectContext =
    [project?.description, project?.techStack].filter(Boolean).join("\n\n") || null;

  const userPrompt = [
    projectContext ? `Project context:\n${projectContext}` : null,
    `Ticket title: ${ticket.title}`,
    ticket.description ? `Ticket description:\n${ticket.description}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = "openrouter/auto";
  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Planbooq",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a senior engineer turning a kanban ticket into a concrete implementation plan for a coding agent. Reply in markdown. Sections: ## Goal, ## Approach, ## Files to change, ## Acceptance criteria. Be specific but concise. No preamble, no closing remarks.",
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `openrouter_${upstream.status}:${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  // Open a job row up front so the client can subscribe and any future GET
  // returns the in-flight stream. Marked RUNNING immediately.
  const job = await prisma.agentJob.create({
    data: {
      ticketId: ticket.id,
      workspaceId: ticket.workspaceId,
      userId,
      source: "PLAN",
      kind: "PLAN",
      status: "RUNNING",
      prompt: userPrompt,
      startedAt: new Date(),
    },
  });
  const jobId = job.id;

  void publishWorkspaceEvent(ticket.workspaceId, {
    name: "agent.delta",
    workspaceId: ticket.workspaceId,
    ticketId: ticket.id,
    jobId,
    kind: "PLAN",
    status: "RUNNING",
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Coalesce DB writes / fanout so we don't slam Postgres or Ably on every
  // token. Tunable; ~250ms feels live without being chatty.
  const FLUSH_MS = 250;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";
      let pending = "";
      let lastFlush = Date.now();
      let buffer = "";

      const flush = async (force = false): Promise<void> => {
        if (!pending) return;
        const now = Date.now();
        if (!force && now - lastFlush < FLUSH_MS) return;
        const chunk = pending;
        pending = "";
        lastFlush = now;
        try {
          // Append-only via Postgres concat; safe under our single-writer model.
          await prisma.$executeRaw`UPDATE "AgentJob" SET "output" = "output" || ${chunk} WHERE "id" = ${jobId}`;
        } catch (err) {
          logger.warn("plan.stream.persist_chunk.failed", {
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        void publishWorkspaceEvent(ticket.workspaceId, {
          name: "agent.delta",
          workspaceId: ticket.workspaceId,
          ticketId: ticket.id,
          jobId,
          kind: "PLAN",
          appendOutput: chunk,
        });
        void mirrorAppendOutput({ job, appendOutput: chunk });
      };

      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = event.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as Delta;
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  pending += delta;
                  controller.enqueue(encoder.encode(delta));
                  await flush(false);
                }
              } catch {
                // ignore malformed chunk
              }
            }
          }
        }
      } catch (err) {
        logger.warn("plan.stream.read.failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await flush(true);
        try {
          if (accumulated.trim()) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { plan: accumulated },
            });
            await moveTicketToStatusKey({
              ticketId: ticket.id,
              toStatusKey: "todo",
              byUserId: userId,
            });
            await createCommentSvc(userId, {
              ticketId: ticket.id,
              body: `**Plan ready** — moved to Todo.\n\n${accumulated}`,
            });
            await prisma.agentJob.update({
              where: { id: jobId },
              data: { status: "SUCCEEDED", finishedAt: new Date(), exitCode: 0 },
            });
            void publishWorkspaceEvent(ticket.workspaceId, {
              name: "agent.delta",
              workspaceId: ticket.workspaceId,
              ticketId: ticket.id,
              jobId,
              kind: "PLAN",
              status: "SUCCEEDED",
            });
            void mirrorJobTerminal({ job, status: "SUCCEEDED", finalOutput: accumulated });
          } else {
            await prisma.agentJob.update({
              where: { id: jobId },
              data: { status: "FAILED", finishedAt: new Date(), error: "empty_response" },
            });
            void publishWorkspaceEvent(ticket.workspaceId, {
              name: "agent.delta",
              workspaceId: ticket.workspaceId,
              ticketId: ticket.id,
              jobId,
              kind: "PLAN",
              status: "FAILED",
            });
            void mirrorJobTerminal({ job, status: "FAILED", finalOutput: accumulated });
          }
        } catch (err) {
          logger.error("plan.stream.persist.failed", {
            ticketId: ticket.id,
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Pbq-Job-Id": jobId,
    },
  });
}
