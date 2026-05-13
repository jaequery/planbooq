import { randomUUID } from "node:crypto";
import type { Message, MessageMentionTargetType, MessageRole } from "@prisma/client";
import { z } from "zod";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-cursor";
import { logger } from "@/lib/logger";
import type { MessageEventPayload, ServerActionResult } from "@/lib/types";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { getOrCreateConversationForTicket } from "@/server/services/conversations";
import { dispatchAgentMentions } from "@/server/services/mention-dispatch";

const MESSAGE_INCLUDE = {
  authorUser: { select: { id: true, name: true, email: true, image: true } },
  authorAgent: { select: { id: true, name: true } },
  mentions: { select: { id: true, targetType: true, targetId: true } },
} as const;

export type MessageWithAuthors = Message & {
  authorUser: { id: string; name: string | null; email: string; image: string | null } | null;
  authorAgent: { id: string; name: string } | null;
  mentions: { id: string; targetType: MessageMentionTargetType; targetId: string }[];
};

async function requireMembership(workspaceId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new Error("forbidden");
}

const MentionSchema = z
  .object({
    targetType: z.enum(["USER", "AGENT", "TICKET"]),
    targetId: z.string().min(1),
  })
  .strict();

// Mention parser: extracts @user, @agent, #ticket from a markdown body. Inline
// chips written by the rich-text composer (Phase 10) will produce structured
// mentions on the client and bypass this; the regex fallback covers manual
// edits and external API calls.
const MENTION_PATTERNS: { type: MessageMentionTargetType; re: RegExp }[] = [
  { type: "TICKET", re: /(?:^|\s)#([a-z0-9-]{6,})/gi },
  // @-mentions are resolved as USER or AGENT in the service layer; the parser
  // can't tell them apart from text alone. The composer is the source of truth
  // for typed mentions; this is a best-effort fallback.
];

const CreateMessageSchema = z
  .object({
    ticketId: z.string().min(1),
    body: z.string().min(1).max(50_000),
    role: z.enum(["USER", "AGENT", "SYSTEM"]).default("USER"),
    parentId: z.string().nullable().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    mentions: z.array(MentionSchema).max(50).optional(),
    // Internal-only fields. The action wrapper for user sessions strips these
    // before calling; the internal signed route (Phase 3) sets them.
    authorAgentId: z.string().nullable().optional(),
    agentJobId: z.string().nullable().optional(),
  })
  .strict();

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

export type CreateMessageContext = {
  // For role=USER, set actorUserId. For role=AGENT, the internal route sets
  // authorAgentId on the input AND passes actorUserId=null (system principal).
  // For role=SYSTEM, both may be null.
  actorUserId: string | null;
  // Trust gate: USER messages must be created via a user session; AGENT
  // messages only via the internal signed route. The route layer sets this.
  trust: "user_session" | "internal_agent" | "system";
};

function deriveByLabel(ctx: CreateMessageContext, message: Message): string {
  if (ctx.actorUserId) return ctx.actorUserId;
  if (message.authorAgentId) return `agent:${message.authorAgentId}`;
  return "system";
}

function toEventPayload(message: MessageWithAuthors): MessageEventPayload {
  return {
    id: message.id,
    conversationId: message.conversationId,
    workspaceId: message.workspaceId,
    role: message.role,
    status: message.status,
    body: message.body,
    authorUserId: message.authorUserId,
    authorAgentId: message.authorAgentId,
    agentJobId: message.agentJobId,
    parentId: message.parentId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    authorUser: message.authorUser,
    authorAgent: message.authorAgent,
    mentions: message.mentions,
  };
}

export async function createMessageSvc(
  ctx: CreateMessageContext,
  rawInput: CreateMessageInput,
): Promise<ServerActionResult<MessageWithAuthors>> {
  try {
    const input = CreateMessageSchema.parse(rawInput);

    // Trust gate. Spoofing protection: a user session cannot set authorAgentId
    // or agentJobId; an internal-agent context cannot create a USER message.
    if (ctx.trust === "user_session") {
      if (input.role !== "USER") return { ok: false, error: "forbidden_role" };
      if (input.authorAgentId || input.agentJobId)
        return { ok: false, error: "forbidden_author_fields" };
      if (!ctx.actorUserId) return { ok: false, error: "unauthenticated" };
    } else if (ctx.trust === "internal_agent") {
      if (input.role !== "AGENT") return { ok: false, error: "forbidden_role" };
      if (!input.authorAgentId) return { ok: false, error: "missing_agent_id" };
    } else {
      // system
      if (input.role !== "SYSTEM") return { ok: false, error: "forbidden_role" };
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, workspaceId: true, projectId: true, archivedAt: true },
    });
    if (!ticket) return { ok: false, error: "ticket_not_found" };
    if (ticket.archivedAt) return { ok: false, error: "ticket_archived" };

    if (ctx.trust === "user_session") {
      await requireMembership(ticket.workspaceId, ctx.actorUserId!);
    } else if (ctx.trust === "internal_agent" && input.authorAgentId) {
      // Cross-tenant guard for agent writes: the agent must belong to the
      // ticket's workspace. The mention-dispatch path (Phase 4) enforces this
      // before enqueueing, but defense-in-depth here too.
      const agent = await prisma.agent.findUnique({
        where: { id: input.authorAgentId },
        select: { workspaceId: true },
      });
      if (!agent || agent.workspaceId !== ticket.workspaceId)
        return { ok: false, error: "agent_workspace_mismatch" };
    }

    const conversation = await getOrCreateConversationForTicket(ticket.id);
    const idempotencyKey = input.idempotencyKey ?? randomUUID();

    // Upsert on idempotencyKey: Inngest retries on transient DB failures will
    // collide on the unique key and return the prior row instead of inserting
    // a duplicate. This is the "INSERT ... ON CONFLICT DO NOTHING" semantic
    // the DDA called out as a HIGH risk.
    const message = await prisma.message.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        conversationId: conversation.id,
        workspaceId: ticket.workspaceId,
        authorUserId: ctx.trust === "user_session" ? ctx.actorUserId : null,
        authorAgentId: ctx.trust === "internal_agent" ? (input.authorAgentId ?? null) : null,
        role: input.role as MessageRole,
        body: input.body,
        status: input.role === "AGENT" ? "PENDING" : "COMPLETE",
        agentJobId: input.agentJobId ?? null,
        parentId: input.parentId ?? null,
        mentions: input.mentions?.length
          ? {
              create: input.mentions.map((m) => ({
                targetType: m.targetType,
                targetId: m.targetId,
              })),
            }
          : undefined,
      },
      update: {},
      include: MESSAGE_INCLUDE,
    });

    await publishWorkspaceEvent(ticket.workspaceId, {
      name: "message.created",
      workspaceId: ticket.workspaceId,
      conversationId: conversation.id,
      ticketId: ticket.id,
      message: toEventPayload(message),
      by: deriveByLabel(ctx, message),
    });

    // Mention-driven dispatch: USER messages that @-mention agents enqueue
    // AgentJobs after the cross-tenant + rate-limit gates in
    // dispatchAgentMentions. Fire-and-forget; failures surface as SYSTEM
    // messages via the dispatcher. SYSTEM messages and AGENT replies don't
    // re-trigger dispatch (would loop).
    if (ctx.trust === "user_session" && message.role === "USER" && message.mentions.length > 0) {
      void dispatchAgentMentions({
        message: { id: message.id, body: message.body, workspaceId: message.workspaceId },
        actorUserId: ctx.actorUserId!,
        ticket: { id: ticket.id, workspaceId: ticket.workspaceId },
        mentions: message.mentions.map((m) => ({
          targetType: m.targetType,
          targetId: m.targetId,
        })),
      }).catch((err) => {
        logger.error("dispatchAgentMentions.failed", {
          messageId: message.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return { ok: true, data: message };
  } catch (error) {
    logger.error("createMessageSvc.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function listMessagesSvc(
  userId: string,
  conversationId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ServerActionResult<{ items: MessageWithAuthors[]; nextCursor: string | null }>> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, workspaceId: true },
  });
  if (!conversation) return { ok: false, error: "conversation_not_found" };
  try {
    await requireMembership(conversation.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  let decodedCursor = decodeKeysetCursor(opts.cursor);
  if (!decodedCursor && opts.cursor) {
    const cursorMessage = await prisma.message.findUnique({
      where: { id: opts.cursor },
      select: { id: true, createdAt: true },
    });
    decodedCursor = cursorMessage
      ? { id: cursorMessage.id, createdAt: cursorMessage.createdAt }
      : null;
  }
  const items = await prisma.message.findMany({
    where: {
      conversationId,
      ...(decodedCursor
        ? {
            OR: [
              { createdAt: { gt: decodedCursor.createdAt } },
              { createdAt: decodedCursor.createdAt, id: { gt: decodedCursor.id } },
            ],
          }
        : {}),
    },
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    items.length > limit && last ? encodeKeysetCursor(last.createdAt, last.id) : null;
  return { ok: true, data: { items: page, nextCursor } };
}

// Per-message debounced broadcaster. Token-rate `message.updated` events
// would saturate Ably's free tier (100 msgs/s/channel) and produce visible
// jitter on the client. We accumulate chunks in-memory for 250ms and emit one
// batched event per window, keeping per-stream publish rate at ~4 events/s.
// Process-local — fine while the app is single-instance; needs Redis pub/sub
// or an Ably-internal channel collator if we scale horizontally.
type ChunkBuffer = {
  chunks: { sequence: number; delta: string }[];
  latestSequence: number;
  timer: NodeJS.Timeout | null;
  workspaceId: string;
  conversationId: string;
  ticketId: string | null;
};
const chunkBuffers = new Map<string, ChunkBuffer>();
const FLUSH_MS = 250;

function scheduleFlush(messageId: string) {
  const buf = chunkBuffers.get(messageId);
  if (!buf || buf.timer) return;
  buf.timer = setTimeout(() => flushChunkBuffer(messageId), FLUSH_MS);
}

async function flushChunkBuffer(messageId: string) {
  const buf = chunkBuffers.get(messageId);
  if (!buf) return;
  const { chunks, latestSequence, workspaceId, conversationId, ticketId } = buf;
  chunkBuffers.delete(messageId);
  if (chunks.length === 0) return;
  await publishWorkspaceEvent(workspaceId, {
    name: "message.updated",
    workspaceId,
    conversationId,
    ticketId,
    messageId,
    status: "STREAMING",
    chunks,
    latestSequence,
  });
}

export async function appendMessageChunkSvc(args: {
  messageId: string;
  agentId: string;
  chunks: { sequence: number; delta: string }[];
}): Promise<ServerActionResult<{ messageId: string; latestSequence: number }>> {
  if (args.chunks.length === 0)
    return { ok: true, data: { messageId: args.messageId, latestSequence: -1 } };

  const message = await prisma.message.findUnique({
    where: { id: args.messageId },
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      authorAgentId: true,
      status: true,
      conversation: { select: { ticketId: true } },
    },
  });
  if (!message) return { ok: false, error: "message_not_found" };
  if (message.authorAgentId !== args.agentId) return { ok: false, error: "agent_mismatch" };
  if (message.status === "COMPLETE" || message.status === "ERROR")
    return { ok: false, error: "message_already_finalized" };

  // Skip duplicates (Inngest retries) by relying on (messageId, sequence) unique.
  await prisma.messageChunk.createMany({
    data: args.chunks.map((c) => ({
      messageId: args.messageId,
      sequence: c.sequence,
      delta: c.delta,
    })),
    skipDuplicates: true,
  });

  // Flip to STREAMING on first chunk; idempotent.
  if (message.status === "PENDING") {
    await prisma.message.update({
      where: { id: args.messageId },
      data: { status: "STREAMING" },
    });
  }

  const latestSequence = Math.max(...args.chunks.map((c) => c.sequence));
  const existing = chunkBuffers.get(args.messageId);
  if (existing) {
    existing.chunks.push(...args.chunks);
    existing.latestSequence = Math.max(existing.latestSequence, latestSequence);
  } else {
    chunkBuffers.set(args.messageId, {
      chunks: [...args.chunks],
      latestSequence,
      timer: null,
      workspaceId: message.workspaceId,
      conversationId: message.conversationId,
      ticketId: message.conversation.ticketId,
    });
  }
  scheduleFlush(args.messageId);

  return { ok: true, data: { messageId: args.messageId, latestSequence } };
}

export async function finalizeMessageSvc(args: {
  messageId: string;
  agentId: string;
  status: "COMPLETE" | "ERROR";
  body?: string;
}): Promise<ServerActionResult<{ messageId: string }>> {
  const message = await prisma.message.findUnique({
    where: { id: args.messageId },
    select: {
      id: true,
      workspaceId: true,
      conversationId: true,
      authorAgentId: true,
      status: true,
      conversation: { select: { ticketId: true } },
    },
  });
  if (!message) return { ok: false, error: "message_not_found" };
  if (message.authorAgentId !== args.agentId) return { ok: false, error: "agent_mismatch" };
  if (message.status === "COMPLETE" || message.status === "ERROR")
    return { ok: true, data: { messageId: args.messageId } };

  // Flush any pending chunk buffer immediately so clients don't see the final
  // event before the last STREAMING tail.
  const pending = chunkBuffers.get(args.messageId);
  if (pending?.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }
  await flushChunkBuffer(args.messageId);

  // Assemble body from chunks if caller didn't supply one. Single ordered
  // read; the unique (messageId, sequence) index keeps this O(n).
  let finalBody = args.body;
  if (!finalBody) {
    const chunks = await prisma.messageChunk.findMany({
      where: { messageId: args.messageId },
      orderBy: { sequence: "asc" },
      select: { delta: true },
    });
    finalBody = chunks.map((c) => c.delta).join("");
  }

  await prisma.message.update({
    where: { id: args.messageId },
    data: { body: finalBody, status: args.status },
  });

  await publishWorkspaceEvent(message.workspaceId, {
    name: "message.updated",
    workspaceId: message.workspaceId,
    conversationId: message.conversationId,
    ticketId: message.conversation.ticketId,
    messageId: args.messageId,
    status: args.status,
    body: finalBody,
  });

  return { ok: true, data: { messageId: args.messageId } };
}

export type TimelineRow =
  | {
      kind: "message";
      id: string;
      createdAt: Date;
      messageId: string;
      message: MessageEventPayload;
    }
  | { kind: "activity"; id: string; createdAt: Date; activityId: string };

// Unified timeline: Messages + TicketActivities for a conversation, ordered by
// createdAt. Returns cursor-paginated row pointers; callers fetch the full
// rows by id from the appropriate table. UNION'ing in SQL is the only way to
// get correct ordering across page boundaries — merging two independently-
// paginated lists in JS produces gaps the DDA flagged as HIGH risk.
export async function getTimelineSvc(
  userId: string,
  conversationId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<ServerActionResult<{ items: TimelineRow[]; nextCursor: string | null }>> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, workspaceId: true, ticketId: true },
  });
  if (!conversation) return { ok: false, error: "conversation_not_found" };
  try {
    await requireMembership(conversation.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const ticketId = conversation.ticketId;
  if (!ticketId) {
    // Standalone conversations (no ticket) have no activity stream — fall
    // back to a plain message list.
    const decodedStandaloneCursor = decodeKeysetCursor(opts.cursor);
    const items = await prisma.message.findMany({
      where: {
        conversationId,
        ...(decodedStandaloneCursor
          ? {
              OR: [
                { createdAt: { gt: decodedStandaloneCursor.createdAt } },
                {
                  createdAt: decodedStandaloneCursor.createdAt,
                  id: { gt: decodedStandaloneCursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      include: MESSAGE_INCLUDE,
    });
    const rows: TimelineRow[] = items.slice(0, limit).map((m) => ({
      kind: "message",
      id: `m:${m.id}`,
      createdAt: m.createdAt,
      messageId: m.id,
      message: toEventPayload(m),
    }));
    const last = items.slice(0, limit).at(-1);
    const nextCursor =
      items.length > limit && last ? encodeKeysetCursor(last.createdAt, last.id) : null;
    return { ok: true, data: { items: rows, nextCursor } };
  }

  // Cursor format: "<iso8601>|<id>". Keyset on (createdAt, id) so equal
  // timestamps don't drop rows. After-cursor only (forward pagination).
  let afterCreatedAt: Date | null = null;
  let afterId: string | null = null;
  const decodedCursor = decodeKeysetCursor(opts.cursor);
  if (decodedCursor) {
    afterCreatedAt = decodedCursor.createdAt;
    afterId = decodedCursor.id;
  }

  const rows = await prisma.$queryRaw<
    { kind: "message" | "activity"; row_id: string; created_at: Date }[]
  >`
    SELECT * FROM (
      SELECT 'message'::text AS kind, id AS row_id, "createdAt" AS created_at
        FROM "Message" WHERE "conversationId" = ${conversationId}
      UNION ALL
      SELECT 'activity'::text AS kind, id AS row_id, "createdAt" AS created_at
        FROM "TicketActivity" WHERE "ticketId" = ${ticketId}
    ) t
    WHERE ${afterCreatedAt}::timestamptz IS NULL
       OR (t.created_at, t.row_id) > (${afterCreatedAt}::timestamptz, ${afterId}::text)
    ORDER BY t.created_at ASC, t.row_id ASC
    LIMIT ${limit + 1}
  `;

  const pageRows = rows.slice(0, limit);
  const messages = await prisma.message.findMany({
    where: { id: { in: pageRows.filter((r) => r.kind === "message").map((r) => r.row_id) } },
    include: MESSAGE_INCLUDE,
  });
  const messageMap = new Map(messages.map((message) => [message.id, toEventPayload(message)]));
  const items: TimelineRow[] = [];
  for (const r of pageRows) {
    if (r.kind === "activity") {
      items.push({
        kind: "activity",
        id: `a:${r.row_id}`,
        createdAt: r.created_at,
        activityId: r.row_id,
      });
      continue;
    }
    const message = messageMap.get(r.row_id);
    if (!message) continue;
    items.push({
      kind: "message",
      id: `m:${r.row_id}`,
      createdAt: r.created_at,
      messageId: r.row_id,
      message,
    });
  }
  const lastRow = rows.length > limit ? rows[limit - 1] : null;
  const nextCursor = lastRow ? encodeKeysetCursor(lastRow.created_at, lastRow.row_id) : null;
  return { ok: true, data: { items, nextCursor } };
}

export async function getMessageChunksSvc(
  userId: string,
  messageId: string,
  afterSequence?: number,
): Promise<
  ServerActionResult<{ messageId: string; chunks: { sequence: number; delta: string }[] }>
> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, workspaceId: true },
  });
  if (!message) return { ok: false, error: "message_not_found" };
  try {
    await requireMembership(message.workspaceId, userId);
  } catch {
    return { ok: false, error: "forbidden" };
  }
  const chunks = await prisma.messageChunk.findMany({
    where: {
      messageId,
      ...(afterSequence !== undefined ? { sequence: { gt: afterSequence } } : {}),
    },
    orderBy: { sequence: "asc" },
    select: { sequence: true, delta: true },
  });
  return { ok: true, data: { messageId, chunks } };
}
