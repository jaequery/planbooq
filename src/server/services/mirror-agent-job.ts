import "server-only";

import type { AgentJob, MessageRole, MessageStatus, Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { getOrCreateConversationForTicket } from "@/server/services/conversations";

// =============================================================================
// Mirror layer for AgentJob → Conversation/Message.
//
// Two distinct modes:
//
//   "plain" — used by the Plan route. The job's `output` is plain markdown
//             streamed from OpenRouter. We mirror it as a single SYSTEM (or
//             AGENT) message per job whose body is appended to in place.
//
//   "wire"  — used by desktop and paired-agent jobs. The job's `output` is
//             newline-delimited WireEvent JSON ({kind:"user"|"agent"|...}).
//             We parse it into proper per-turn USER and AGENT messages so
//             the conversation thread renders real turn bubbles instead of
//             one giant JSONL blob.
//
// Mode is picked from job.kind in helpers below; callers can override.
// =============================================================================

export type MirrorMode = "plain" | "wire";

export function modeForJob(job: Pick<AgentJob, "kind" | "source">): MirrorMode {
  // Plan route is the only producer of plain markdown streams. Everything
  // else (desktop chat, paired-agent EXECUTE/CHAT) emits WireEvent JSONL.
  if (job.kind === "PLAN") return "plain";
  return "wire";
}

// -----------------------------------------------------------------------------
// PLAIN MODE — single message per job, appended in place.
// -----------------------------------------------------------------------------

async function ensurePlainMessage(job: AgentJob): Promise<{
  messageId: string;
  agentId: string | null;
} | null> {
  if (!job.workspaceId || !job.ticketId) return null;
  const conversation = await getOrCreateConversationForTicket(job.ticketId);

  const idempotencyKey = `agent-job:${job.id}:plain`;
  const existing = await prisma.message.findUnique({
    where: { idempotencyKey },
    select: { id: true, authorAgentId: true },
  });
  if (existing) return { messageId: existing.id, agentId: existing.authorAgentId };

  const role: MessageRole = job.agentId ? "AGENT" : "SYSTEM";
  const message = await prisma.message.create({
    data: {
      idempotencyKey,
      conversationId: conversation.id,
      workspaceId: job.workspaceId,
      role,
      authorAgentId: role === "AGENT" ? job.agentId : null,
      agentJobId: job.id,
      body: "",
      status: "PENDING",
    },
  });
  return { messageId: message.id, agentId: job.agentId };
}

async function mirrorPlainAppend(job: AgentJob, appendOutput: string): Promise<void> {
  if (!appendOutput) return;
  const paired = await ensurePlainMessage(job);
  if (!paired) return;
  // Append by concatenation. Single-writer per job so we don't need a CAS.
  await prisma.$executeRaw`
    UPDATE "Message"
       SET "body" = "body" || ${appendOutput},
           "status" = CASE WHEN "status" = 'PENDING' THEN 'STREAMING'::"MessageStatus" ELSE "status" END,
           "updatedAt" = NOW()
     WHERE "id" = ${paired.messageId}
  `;
  if (job.workspaceId) {
    await publishWorkspaceEvent(job.workspaceId, {
      name: "message.updated",
      workspaceId: job.workspaceId,
      conversationId: (await getOrCreateConversationForTicket(job.ticketId)).id,
      ticketId: job.ticketId,
      messageId: paired.messageId,
      status: "STREAMING",
      // The render path treats a body update as authoritative; passing it here
      // also lets late subscribers paint without a chunk replay.
      body: undefined,
    });
  }
}

async function mirrorPlainTerminal(
  job: AgentJob,
  status: "SUCCEEDED" | "FAILED" | "CANCELED",
  finalOutput: string,
): Promise<void> {
  const messageStatus: MessageStatus = status === "SUCCEEDED" ? "COMPLETE" : "ERROR";
  if (!job.workspaceId || !job.ticketId) return;
  const idempotencyKey = `agent-job:${job.id}:plain`;
  const conversation = await getOrCreateConversationForTicket(job.ticketId);
  const role: MessageRole = job.agentId ? "AGENT" : "SYSTEM";

  const upserted = await prisma.message.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      conversationId: conversation.id,
      workspaceId: job.workspaceId,
      role,
      authorAgentId: role === "AGENT" ? job.agentId : null,
      agentJobId: job.id,
      body: finalOutput,
      status: messageStatus,
    },
    update: {
      body: finalOutput,
      status: messageStatus,
    },
    select: { id: true },
  });

  await publishWorkspaceEvent(job.workspaceId, {
    name: "message.updated",
    workspaceId: job.workspaceId,
    conversationId: conversation.id,
    ticketId: job.ticketId,
    messageId: upserted.id,
    status: messageStatus,
    body: finalOutput,
  });
}

// -----------------------------------------------------------------------------
// WIRE MODE — parse WireEvent JSONL into per-turn USER + AGENT messages.
// -----------------------------------------------------------------------------

type WireEvent =
  | { kind: "user"; text: string; at?: number }
  | { kind: "agent"; line: string; at?: number }
  | { kind: "stderr"; line: string; at?: number }
  | { kind: "exit"; code: number; at?: number };

type AssistantBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};
type ParsedClaude = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  error?: string;
  message?: { content?: AssistantBlock[] };
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    content_block?: { type?: string; text?: string };
  };
};

type WireJobState = {
  conversationId: string;
  agentMessageId: string | null;
  agentBody: string;
  // Claude emits both per-token `stream_event` deltas AND a final `assistant`
  // block carrying the full turn text. They're redundant — when the final
  // block lands, it supersedes the streamed buffer rather than appending to
  // it. This flag tracks whether the current open turn has been "sealed" by
  // an assistant block so subsequent stream events are ignored within it.
  agentSealedByAssistant: boolean;
  agentTurnSeq: number;
  userSeq: number;
  toolSeq: number;
};

const wireStates = new Map<string, WireJobState>();

async function getWireState(job: AgentJob): Promise<WireJobState | null> {
  if (!job.workspaceId || !job.ticketId) return null;
  const cached = wireStates.get(job.id);
  if (cached) return cached;

  const conversation = await getOrCreateConversationForTicket(job.ticketId);
  // Bootstrap sequences from any messages already written for this job — keeps
  // idempotency keys monotonic across server restarts and request retries.
  const existing = await prisma.message.findMany({
    where: { agentJobId: job.id },
    select: { id: true, idempotencyKey: true, status: true, role: true, body: true },
  });
  let userSeq = 0;
  let agentTurnSeq = 0;
  let toolSeq = 0;
  let agentMessageId: string | null = null;
  let agentBody = "";
  for (const m of existing) {
    const um = m.idempotencyKey.match(/^agent-job:[^:]+:user:(\d+)$/);
    const am = m.idempotencyKey.match(/^agent-job:[^:]+:asst:(\d+)$/);
    const tm = m.idempotencyKey.match(/^agent-job:[^:]+:tool:(\d+)$/);
    if (um) userSeq = Math.max(userSeq, Number(um[1]) + 1);
    if (tm) toolSeq = Math.max(toolSeq, Number(tm[1]) + 1);
    if (am) {
      const n = Number(am[1]);
      agentTurnSeq = Math.max(agentTurnSeq, n + 1);
      if (m.status === "PENDING" || m.status === "STREAMING") {
        agentMessageId = m.id;
        agentBody = m.body;
      }
    }
  }
  const state: WireJobState = {
    conversationId: conversation.id,
    agentMessageId,
    agentBody,
    agentSealedByAssistant: false,
    agentTurnSeq,
    userSeq,
    toolSeq,
  };
  wireStates.set(job.id, state);
  return state;
}

function clearWireState(jobId: string): void {
  wireStates.delete(jobId);
}

async function emitUserTurn(
  job: AgentJob,
  state: WireJobState,
  ev: Extract<WireEvent, { kind: "user" }>,
): Promise<void> {
  const seq = state.userSeq;
  state.userSeq += 1;
  const idempotencyKey = `agent-job:${job.id}:user:${seq}`;
  const message = await prisma.message.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      conversationId: state.conversationId,
      workspaceId: job.workspaceId!,
      role: "USER",
      authorUserId: job.userId ?? null,
      agentJobId: job.id,
      body: ev.text,
      status: "COMPLETE",
      createdAt: ev.at ? new Date(ev.at) : undefined,
    },
    update: {},
    select: {
      id: true,
      conversationId: true,
      workspaceId: true,
      role: true,
      status: true,
      body: true,
      authorUserId: true,
      authorAgentId: true,
      agentJobId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  await publishWorkspaceEvent(job.workspaceId!, {
    name: "message.created",
    workspaceId: job.workspaceId!,
    conversationId: state.conversationId,
    ticketId: job.ticketId,
    message: {
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
      authorUser: null,
      authorAgent: null,
      mentions: [],
    },
    by: job.userId ?? "system",
  });
}

async function ensureAgentMessage(job: AgentJob, state: WireJobState): Promise<string> {
  if (state.agentMessageId) return state.agentMessageId;
  const seq = state.agentTurnSeq;
  state.agentTurnSeq += 1;
  const idempotencyKey = `agent-job:${job.id}:asst:${seq}`;
  const role: MessageRole = job.agentId ? "AGENT" : "SYSTEM";
  const created = await prisma.message.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      conversationId: state.conversationId,
      workspaceId: job.workspaceId!,
      role,
      authorAgentId: role === "AGENT" ? job.agentId : null,
      agentJobId: job.id,
      body: "",
      status: "STREAMING",
    },
    update: {},
    select: {
      id: true,
      conversationId: true,
      workspaceId: true,
      role: true,
      status: true,
      body: true,
      authorUserId: true,
      authorAgentId: true,
      agentJobId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  state.agentMessageId = created.id;
  state.agentBody = "";
  state.agentSealedByAssistant = false;
  await publishWorkspaceEvent(job.workspaceId!, {
    name: "message.created",
    workspaceId: job.workspaceId!,
    conversationId: state.conversationId,
    ticketId: job.ticketId,
    message: {
      id: created.id,
      conversationId: created.conversationId,
      workspaceId: created.workspaceId,
      role: created.role,
      status: created.status,
      body: created.body,
      authorUserId: created.authorUserId,
      authorAgentId: created.authorAgentId,
      agentJobId: created.agentJobId,
      parentId: created.parentId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      authorUser: null,
      authorAgent: null,
      mentions: [],
    },
    by: job.agentId ? `agent:${job.agentId}` : "system",
  });
  return created.id;
}

async function flushAgentBody(
  job: AgentJob,
  state: WireJobState,
  finalize: boolean,
): Promise<void> {
  if (!state.agentMessageId) return;
  const messageId = state.agentMessageId;
  const status: MessageStatus = finalize ? "COMPLETE" : "STREAMING";
  await prisma.message.update({
    where: { id: messageId },
    data: { body: state.agentBody, status },
  });
  await publishWorkspaceEvent(job.workspaceId!, {
    name: "message.updated",
    workspaceId: job.workspaceId!,
    conversationId: state.conversationId,
    ticketId: job.ticketId,
    messageId,
    status,
    body: state.agentBody,
  });
  if (finalize) {
    state.agentMessageId = null;
    state.agentBody = "";
  }
}

function formatToolUse(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return `→ ${name}`;
  const pick = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  let arg = "";
  switch (name) {
    case "Bash":
      arg = pick("command");
      break;
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      arg = pick("file_path");
      break;
    case "Glob":
    case "Grep":
      arg = pick("pattern");
      break;
    case "WebFetch":
    case "WebSearch":
      arg = pick("url") || pick("query");
      break;
    default:
      arg = "";
  }
  const trimmed = arg.length > 200 ? `${arg.slice(0, 197)}…` : arg;
  return trimmed ? `→ ${name}: ${trimmed}` : `→ ${name}`;
}

async function emitToolCall(
  job: AgentJob,
  state: WireJobState,
  text: string,
  at?: number,
): Promise<void> {
  // Tool calls land between assistant text turns. Each is its own short
  // SYSTEM-style message so the thread reads as a sequence of small actions
  // rather than a wall of agent output.
  const seq = state.toolSeq;
  state.toolSeq += 1;
  const idempotencyKey = `agent-job:${job.id}:tool:${seq}`;
  const role: MessageRole = job.agentId ? "AGENT" : "SYSTEM";
  const created = await prisma.message.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      conversationId: state.conversationId,
      workspaceId: job.workspaceId!,
      role,
      authorAgentId: role === "AGENT" ? job.agentId : null,
      agentJobId: job.id,
      body: text,
      status: "COMPLETE",
      createdAt: at ? new Date(at) : undefined,
    },
    update: {},
    select: {
      id: true,
      conversationId: true,
      workspaceId: true,
      role: true,
      status: true,
      body: true,
      authorUserId: true,
      authorAgentId: true,
      agentJobId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  await publishWorkspaceEvent(job.workspaceId!, {
    name: "message.created",
    workspaceId: job.workspaceId!,
    conversationId: state.conversationId,
    ticketId: job.ticketId,
    message: {
      id: created.id,
      conversationId: created.conversationId,
      workspaceId: created.workspaceId,
      role: created.role,
      status: created.status,
      body: created.body,
      authorUserId: created.authorUserId,
      authorAgentId: created.authorAgentId,
      agentJobId: created.agentJobId,
      parentId: created.parentId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      authorUser: null,
      authorAgent: null,
      mentions: [],
    },
    by: job.agentId ? `agent:${job.agentId}` : "system",
  });
}

// Process one inner Claude stream line. Returns true if any text was appended
// to the current assistant message (so the caller can flush a single update
// per batch).
async function applyClaudeLine(
  job: AgentJob,
  state: WireJobState,
  parsed: ParsedClaude,
  at?: number,
): Promise<{ textAppended: boolean; turnEnded: boolean }> {
  let textAppended = false;
  let turnEnded = false;

  if (parsed.type === "stream_event" && parsed.event) {
    // Once the assistant block has sealed this turn, ignore further deltas —
    // they're redundant with the block we already accepted.
    if (state.agentSealedByAssistant) return { textAppended, turnEnded };
    const inner = parsed.event;
    if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta") {
      const text = inner.delta.text ?? "";
      if (text) {
        await ensureAgentMessage(job, state);
        state.agentBody += text;
        textAppended = true;
      }
    } else if (
      inner.type === "content_block_start" &&
      inner.content_block?.type === "text" &&
      inner.content_block.text
    ) {
      await ensureAgentMessage(job, state);
      state.agentBody += inner.content_block.text;
      textAppended = true;
    } else if (inner.type === "message_stop") {
      // Don't end the turn here — `assistant`/`result` are the authoritative
      // boundaries. Some agents emit message_stop mid-stream between blocks.
    }
    return { textAppended, turnEnded };
  }

  if (parsed.type === "assistant" && parsed.message) {
    const blocks = parsed.message.content ?? [];
    // Single-pass over blocks so a mixed sequence like
    // [text, tool_use, text, tool_use] renders as text → tool → text → tool
    // in the conversation. Each text block REPLACES any streamed deltas we
    // were buffering (assistant blocks are authoritative); subsequent text
    // blocks within this same event start a new agent message after the
    // intervening tool call closes the previous one.
    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string" && b.text) {
        await ensureAgentMessage(job, state);
        if (state.agentSealedByAssistant) {
          state.agentBody += b.text;
        } else {
          state.agentBody = b.text;
          state.agentSealedByAssistant = true;
        }
        textAppended = true;
      } else if (b.type === "tool_use" && typeof b.name === "string") {
        if (state.agentMessageId && state.agentBody.length > 0) {
          await flushAgentBody(job, state, true);
        } else if (state.agentMessageId) {
          await prisma.message.delete({ where: { id: state.agentMessageId } }).catch(() => {});
          state.agentMessageId = null;
          state.agentBody = "";
        }
        await emitToolCall(job, state, formatToolUse(b.name, b.input), at);
      }
    }
    return { textAppended, turnEnded };
  }

  if (parsed.type === "result") {
    turnEnded = true;
    const isError =
      parsed.is_error === true ||
      (typeof parsed.subtype === "string" && /^error/i.test(parsed.subtype));
    if (isError) {
      const summary =
        (typeof parsed.error === "string" && parsed.error.trim()) ||
        (typeof parsed.result === "string" && parsed.result.trim()) ||
        state.agentBody.slice(-300).trim() ||
        parsed.subtype ||
        "Run failed";
      // Mark the open agent turn as ERROR rather than COMPLETE so the bubble
      // renders with the error treatment instead of looking like a normal
      // reply, and broadcast so any open panel updates immediately.
      if (state.agentMessageId) {
        const messageId = state.agentMessageId;
        await prisma.message.update({
          where: { id: messageId },
          data: { body: state.agentBody, status: "ERROR" },
        });
        await publishWorkspaceEvent(job.workspaceId!, {
          name: "message.updated",
          workspaceId: job.workspaceId!,
          conversationId: state.conversationId,
          ticketId: job.ticketId,
          messageId,
          status: "ERROR",
          body: state.agentBody,
        });
        state.agentMessageId = null;
        state.agentBody = "";
        state.agentSealedByAssistant = false;
      }
      // Server-side activity log so the right rail records the failure even
      // when the panel that produced the run is no longer open.
      try {
        const text = `Agent error: ${summary.replace(/\s+/g, " ").slice(0, 480)}`;
        const activity = await prisma.ticketActivity.create({
          data: {
            ticketId: job.ticketId,
            workspaceId: job.workspaceId!,
            jobId: job.id,
            kind: "NOTE",
            payload: { text } as Prisma.InputJsonValue,
          },
          select: { id: true, kind: true, payload: true, jobId: true, createdAt: true },
        });
        await publishWorkspaceEvent(job.workspaceId!, {
          name: "ticket.activity",
          workspaceId: job.workspaceId!,
          ticketId: job.ticketId,
          activity: {
            id: activity.id,
            kind: activity.kind,
            payload: activity.payload as Record<string, unknown>,
            jobId: activity.jobId,
            createdAt: activity.createdAt.toISOString(),
          },
        });
      } catch (err) {
        logger.warn("mirror.activity.error.failed", {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { textAppended, turnEnded };
  }

  return { textAppended, turnEnded };
}

async function mirrorWireAppend(job: AgentJob, appendOutput: string): Promise<void> {
  if (!appendOutput) return;
  const state = await getWireState(job);
  if (!state) return;

  let textAppended = false;
  let turnEnded = false;

  for (const raw of appendOutput.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let ev: WireEvent;
    try {
      ev = JSON.parse(line) as WireEvent;
    } catch {
      continue;
    }
    if (ev.kind === "user") {
      // Close any open assistant turn before the user speaks again.
      if (state.agentMessageId && state.agentBody.length > 0) {
        await flushAgentBody(job, state, true);
      }
      await emitUserTurn(job, state, ev);
    } else if (ev.kind === "agent") {
      let parsed: ParsedClaude;
      try {
        parsed = JSON.parse(ev.line) as ParsedClaude;
      } catch {
        continue;
      }
      const r = await applyClaudeLine(job, state, parsed, ev.at);
      textAppended = textAppended || r.textAppended;
      if (r.turnEnded) {
        if (state.agentMessageId) {
          await flushAgentBody(job, state, true);
        }
        turnEnded = true;
      }
    } else if (ev.kind === "exit") {
      if (state.agentMessageId) {
        await flushAgentBody(job, state, true);
      }
    }
    // stderr is intentionally ignored in the conversation surface.
  }

  // One body flush per batch when text accumulated but the turn hasn't ended.
  if (textAppended && !turnEnded && state.agentMessageId) {
    await flushAgentBody(job, state, false);
  }
}

async function mirrorWireTerminal(
  job: AgentJob,
  status: "SUCCEEDED" | "FAILED" | "CANCELED",
): Promise<void> {
  const state = await getWireState(job);
  if (!state) return;
  if (state.agentMessageId) {
    const finalStatus: MessageStatus = status === "SUCCEEDED" ? "COMPLETE" : "ERROR";
    const messageId = state.agentMessageId;
    await prisma.message.update({
      where: { id: messageId },
      data: { body: state.agentBody, status: finalStatus },
    });
    await publishWorkspaceEvent(job.workspaceId!, {
      name: "message.updated",
      workspaceId: job.workspaceId!,
      conversationId: state.conversationId,
      ticketId: job.ticketId,
      messageId,
      status: finalStatus,
      body: state.agentBody,
    });
    state.agentMessageId = null;
    state.agentBody = "";
  }
  // Belt-and-suspenders: any other PENDING/STREAMING messages tied to this
  // job (e.g. orphaned by a server restart) get marked terminal too.
  await prisma.message.updateMany({
    where: {
      agentJobId: job.id,
      status: { in: ["PENDING", "STREAMING"] },
    },
    data: { status: status === "SUCCEEDED" ? "COMPLETE" : "ERROR" },
  });
  clearWireState(job.id);
}

// -----------------------------------------------------------------------------
// Public API — mode-dispatched entry points used by route handlers and the
// reaper. Failures are logged and swallowed; mirroring must never break the
// underlying AgentJob update path.
// -----------------------------------------------------------------------------

export async function mirrorAppendOutput(args: {
  job: AgentJob;
  appendOutput: string;
  mode?: MirrorMode;
}): Promise<void> {
  if (!args.appendOutput) return;
  const mode = args.mode ?? modeForJob(args.job);
  try {
    if (mode === "plain") {
      await mirrorPlainAppend(args.job, args.appendOutput);
    } else {
      await mirrorWireAppend(args.job, args.appendOutput);
    }
  } catch (error) {
    logger.error("mirrorAppendOutput.failed", {
      jobId: args.job.id,
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function mirrorJobTerminal(args: {
  job: AgentJob;
  status: "SUCCEEDED" | "FAILED" | "CANCELED";
  finalOutput: string;
  mode?: MirrorMode;
}): Promise<void> {
  const mode = args.mode ?? modeForJob(args.job);
  try {
    if (mode === "plain") {
      await mirrorPlainTerminal(args.job, args.status, args.finalOutput);
    } else {
      await mirrorWireTerminal(args.job, args.status);
    }
  } catch (error) {
    logger.error("mirrorJobTerminal.failed", {
      jobId: args.job.id,
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
