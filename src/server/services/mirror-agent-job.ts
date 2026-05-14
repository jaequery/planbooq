import "server-only";

import type { AgentJob, AgentJobStatus, MessageRole, MessageStatus, Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { publishWorkspaceEvent } from "@/server/ably";
import { prisma } from "@/server/db";
import { inngest } from "@/server/inngest/client";
import {
  classifyAgentJobOutcome,
  emptyResponseMessageBody,
} from "@/server/services/agent-job-outcome";
import { getOrCreateConversationForTicket } from "@/server/services/conversations";
import { reconcileBuildingTicket } from "@/server/services/ticket-status";
import { shouldAutoChainAfterStep, workflowCommander } from "@/server/services/workflow-commander";

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

  // Plain-mode classification: the only signal is finalOutput length. Tool
  // use isn't a concept in this mode (Plan jobs are pure markdown streams),
  // so toolUses=0 for the purposes of classification.
  await persistTerminalOutcome(job, conversation.id, status, {
    textChars: finalOutput.length,
    toolUses: 0,
  });
}

// -----------------------------------------------------------------------------
// WIRE MODE — parse WireEvent JSONL into per-turn USER + AGENT messages.
// -----------------------------------------------------------------------------

type WireEvent =
  | { kind: "user"; text: string; at?: number; stepRunId?: string | null }
  | { kind: "agent"; line: string; at?: number; stepRunId?: string | null }
  | { kind: "stderr"; line: string; at?: number; stepRunId?: string | null }
  | { kind: "exit"; code: number; at?: number; stepRunId?: string | null };

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
  // Outcome signals: total visible text emitted by the agent across all
  // turns in this job, and total tool calls invoked. Used by
  // classifyAgentJobOutcome at terminal to distinguish a clean COMPLETED run
  // from an EMPTY_RESPONSE one. textChars counts characters from sealed
  // assistant blocks AND streamed text_deltas (the two are redundant within
  // a turn but never both contribute to the count: once an assistant block
  // seals a turn, further deltas are ignored).
  textChars: number;
  toolUses: number;
  // Per-job pointer to the active WorkflowStepRun. Updated when a user wire
  // event arrives carrying a stepRunId (or whenever the renderer dispatches
  // a new step via bridge.agentSend with workflowStepRunId set). Stamped
  // onto every Message row this state creates from that point forward, so a
  // single AgentJob spanning multiple workflow steps in one Claude session
  // gets correct per-step attribution.
  currentStepRunId: string | null;
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
    select: {
      id: true,
      idempotencyKey: true,
      status: true,
      role: true,
      body: true,
      workflowStepRunId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  let userSeq = 0;
  let agentTurnSeq = 0;
  let toolSeq = 0;
  let agentMessageId: string | null = null;
  let agentBody = "";
  let textChars = 0;
  let toolUses = 0;
  // Recover the most recently observed step pointer so a server restart
  // mid-step doesn't blank attribution for the rest of the turn. The latest
  // (non-null) Message.workflowStepRunId for this job wins.
  let currentStepRunId: string | null = job.workflowStepRunId ?? null;
  for (const m of existing) {
    const um = m.idempotencyKey.match(/^agent-job:[^:]+:user:(\d+)$/);
    const am = m.idempotencyKey.match(/^agent-job:[^:]+:asst:(\d+)$/);
    const tm = m.idempotencyKey.match(/^agent-job:[^:]+:tool:(\d+)$/);
    if (um) userSeq = Math.max(userSeq, Number(um[1]) + 1);
    if (tm) {
      toolSeq = Math.max(toolSeq, Number(tm[1]) + 1);
      toolUses += 1;
    }
    if (am) {
      const n = Number(am[1]);
      agentTurnSeq = Math.max(agentTurnSeq, n + 1);
      // Count text emitted across all prior assistant turns for this job so
      // a server restart mid-job doesn't reset the EMPTY_RESPONSE detector.
      textChars += m.body.length;
      if (m.status === "PENDING" || m.status === "STREAMING") {
        agentMessageId = m.id;
        agentBody = m.body;
      }
    }
    if (m.workflowStepRunId) currentStepRunId = m.workflowStepRunId;
  }
  const state: WireJobState = {
    conversationId: conversation.id,
    agentMessageId,
    agentBody,
    agentSealedByAssistant: false,
    agentTurnSeq,
    userSeq,
    toolSeq,
    textChars,
    toolUses,
    currentStepRunId,
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
      // The wire event is the authoritative attribution: Electron main
      // stamps the active stepRunId at write time, so a step-2 user message
      // gets step 2 even if the AgentJob was originally bound to step 1
      // (warm-send within one Claude session).
      workflowStepRunId: ev.stepRunId ?? state.currentStepRunId ?? null,
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
      workflowStepRunId: state.currentStepRunId ?? null,
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
      workflowStepRunId: state.currentStepRunId ?? null,
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
        state.textChars += text.length;
        textAppended = true;
      }
    } else if (
      inner.type === "content_block_start" &&
      inner.content_block?.type === "text" &&
      inner.content_block.text
    ) {
      await ensureAgentMessage(job, state);
      state.agentBody += inner.content_block.text;
      state.textChars += inner.content_block.text.length;
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
          state.textChars += b.text.length;
        } else {
          // Sealing replaces the streamed buffer with the authoritative block,
          // so the text-char counter has to swap correspondingly: subtract
          // what we'd counted from deltas and credit only the sealed block.
          state.textChars = state.textChars - state.agentBody.length + b.text.length;
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
        state.toolUses += 1;
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
      // FAILURE path: also log STEP_COMPLETED (result=failure) so the
      // activity log records the step finishing regardless of outcome, and
      // flip the matching WorkflowStepRun to FAILED. Fire-and-forget so a
      // slow activity insert never stalls wire mirroring.
      void persistTurnEnd(job, { kind: "failure", error: summary }).catch((err: unknown) => {
        logger.warn("mirror.turn-end.failed", {
          jobId: job.id,
          result: "failure",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else {
      // SUCCESS path: agent finished its turn cleanly and is yielding to the
      // user. Log STEP_COMPLETED if applicable and demote ticket to Blocked.
      // Fire-and-forget so a slow activity insert never stalls wire mirroring.
      void persistTurnEnd(job, { kind: "success" }).catch((err: unknown) => {
        logger.warn("mirror.turn-end.failed", {
          jobId: job.id,
          result: "success",
          error: err instanceof Error ? err.message : String(err),
        });
      });
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
      // Update the per-job step pointer FIRST so the user message itself —
      // and every agent/tool message that follows in this turn — gets the
      // new step credited. An ev.stepRunId of `null` is an explicit "no
      // step" (free-form chat), so we honor that; only `undefined` means
      // "no signal, keep the previous pointer."
      if (ev.stepRunId !== undefined) {
        state.currentStepRunId = ev.stepRunId;
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

type TurnEndOutcome = { kind: "success" } | { kind: "failure"; error: string };

// Per-turn end handling. Fires when Claude emits a `result` event — i.e. the
// agent finished its turn and is yielding control back to the user, either
// cleanly (success) or with an error. Side-effects:
//
//   1. WorkflowStepRun transition. The matching step row (resolved via
//      per-message FK → job FK → name lookup) flips PENDING/RUNNING to
//      SUCCEEDED on success or FAILED on failure. Idempotent CAS so a
//      re-fire of the same turn-end can't bounce a terminal step.
//
//   2. STEP_COMPLETED activity. If the prompt that started this turn was a
//      workflow step (`[Workflow N/M: <name>]`), log a STEP_COMPLETED row
//      tagged with `result: "success" | "failure"` (plus an `error` summary
//      on failure) so the activity log records the step finishing regardless
//      of outcome. Idempotent on (ticketId, payload.name) — first writer
//      wins, mirroring the existing dedup against the renderer-side handler
//      in ticket-workflow-panel.tsx.
//
//   3. (Success only) Status demotion to Blocked. The agent's CLI process is
//      still alive (waiting on stdin for the next prompt), but the contract —
//      see ticket-agent-panel.tsx:935 — is "no auto-chain between workflow
//      steps." So the ticket should move out of Running until the user
//      decides what's next. excludeJobId is critical: our job is still
//      RUNNING and would otherwise look like a live sibling to the
//      reconciler and abort the demote. On failure we skip reconcile — the
//      higher-level NOTE write in applyClaudeLine and mirrorJobTerminal's
//      terminal handling already drive the ticket out of Building.
async function persistTurnEnd(job: AgentJob, outcome: TurnEndOutcome): Promise<void> {
  if (!job.workspaceId || !job.ticketId) return;

  // Find the user message that opened the just-finished turn. We use it for
  // two independent purposes: the prompt body gives us the step name (for
  // the STEP_COMPLETED activity), and the workflowStepRunId FK — set by the
  // mirror service at write time from the wire event's stepRunId — gives
  // us an authoritative pointer at the step the turn actually belonged to,
  // even when the AgentJob spans multiple steps (warm-send).
  const lastUser = await prisma.message.findFirst({
    where: { agentJobId: job.id, role: "USER" },
    orderBy: { createdAt: "desc" },
    select: { body: true, workflowStepRunId: true },
  });
  let stepName: string | null = null;
  if (lastUser?.body) {
    // Matches `[Workflow: Plan]` and `[Workflow 1/3: Plan]`. Same shape the
    // renderer dispatches in ticket-workflow-panel.tsx:307 / 341.
    const m = lastUser.body.match(/^\[Workflow(?:\s+\d+\/\d+)?:\s*([^\]]+)\]/);
    if (m?.[1]) stepName = m[1].trim();
  }

  // Resolve the WorkflowStepRun to transition. Priority order:
  //   1. The user message's workflowStepRunId — per-message FK, accurate
  //      for warm-send because Electron main stamps the active step at
  //      write time on every wire event.
  //   2. The AgentJob's workflowStepRunId — set at cold-start by the
  //      desktop-jobs route. Correct when the job spans exactly one step.
  //   3. Name-based lookup against the prompt prefix — legacy fallback
  //      for jobs that predate the FK plumbing.
  let stepRunIdToClose: string | null =
    lastUser?.workflowStepRunId ?? job.workflowStepRunId ?? null;
  if (!stepRunIdToClose && stepName) {
    const candidate = await prisma.workflowStepRun
      .findFirst({
        where: {
          name: stepName,
          status: { in: ["PENDING", "RUNNING"] },
          run: { ticketId: job.ticketId },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      .catch(() => null);
    stepRunIdToClose = candidate?.id ?? null;
  }

  const completion = stepRunIdToClose
    ? await workflowCommander.completeStep({
        stepRunId: stepRunIdToClose,
        jobId: job.id,
        result: outcome.kind === "success" ? "success" : "failure",
        ...(outcome.kind === "failure" ? { error: outcome.error } : {}),
      })
    : { transitioned: false, runId: null };
  const stepRunTransitioned = completion.transitioned;

  // Server-driven workflow chain. Only fire when THIS call is the one that
  // actually transitioned the step to SUCCEEDED — protects against a retry
  // of persistTurnEnd (e.g. reaper re-mirror) republishing dispatch events
  // for an already-progressed run. Failure path is intentionally left for
  // the user to resolve; auto-chaining past a failure would just compound
  // the problem.
  if (stepRunTransitioned && outcome.kind === "success" && stepRunIdToClose) {
    try {
      await inngest.send({
        name: "workflow/step.completed",
        data: {
          stepRunId: stepRunIdToClose,
          workspaceId: job.workspaceId,
          ticketId: job.ticketId,
        },
      });
    } catch (err) {
      logger.warn("mirror.workflow-step-completed.send.failed", {
        jobId: job.id,
        stepRunId: stepRunIdToClose,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Reconcile only on success. The failure path already routes through the
  // NOTE write in applyClaudeLine and mirrorJobTerminal; running reconcile
  // here would race with those.
  //
  // Auto-chain carve-out: when the ticket is `autonomous` and the workflow
  // has more PENDING steps, skip the Blocked demotion. The
  // workflow-step-completed Inngest handler will dispatch the next step
  // within ~100ms and the desktop client will warm-send its prompt into the
  // still-alive Claude session. Demoting to Blocked here would race that
  // dispatch: the desktop panel's "external move to Blocked = kill the
  // session" handler (ticket-agent-panel.tsx:938) SIGTERMs the process
  // mid-warm-send, the cancel gets mis-credited to the just-warm-sent step
  // by resolveTerminalStepRunId (mirror-agent-job.ts:1054), and the
  // staleness reaper (workflow.ts:693) finishes off the WorkflowRun. See
  // PLAN-LYVQV8 for the full forensics. Non-autonomous tickets still demote
  // — the Inngest handler also gates on the same predicate, so the
  // dispatch won't fire and the user clicks Run to advance manually.
  if (outcome.kind === "success") {
    const autoChaining =
      stepRunTransitioned && completion.runId
        ? await shouldAutoChainAfterStep(job.ticketId, completion.runId).catch((err: unknown) => {
            logger.warn("mirror.turn-end.auto-chain-check.failed", {
              jobId: job.id,
              error: err instanceof Error ? err.message : String(err),
            });
            return false;
          })
        : false;
    if (!autoChaining) {
      await reconcileBuildingTicket({
        ticketId: job.ticketId,
        byUserId: job.userId,
        excludeJobId: job.id,
        jobStatus: "SUCCEEDED",
      }).catch((err: unknown) => {
        logger.warn("mirror.turn-end.reconcile.failed", {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }
}

// Shared terminal-outcome handling: classify the run, persist the result on
// the AgentJob row, and (if EMPTY_RESPONSE) insert a SYSTEM-role Message into
// the conversation so the chat thread surfaces an actionable "no output"
// marker instead of looking deceptively empty. Idempotent on the synthetic
// insert via the `:outcome:empty_response` idempotency key — safe to invoke
// from both the request-path mirror and the Inngest reaper.
async function persistTerminalOutcome(
  job: AgentJob,
  conversationId: string,
  status: AgentJobStatus,
  signals: { textChars: number; toolUses: number },
): Promise<void> {
  const classification = classifyAgentJobOutcome({
    status,
    textChars: signals.textChars,
    toolUses: signals.toolUses,
  });

  await prisma.agentJob
    .update({
      where: { id: job.id },
      data: {
        outcome: classification.outcome,
        outcomeReason: classification.reason,
      },
    })
    .catch((err: unknown) => {
      logger.warn("mirror.outcome.persist.failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  if (classification.outcome !== "EMPTY_RESPONSE") return;
  if (!job.workspaceId) return;

  const idempotencyKey = `agent-job:${job.id}:outcome:empty_response`;
  const body = emptyResponseMessageBody(classification.reason);
  const existing = await prisma.message.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) return;

  let created: Awaited<ReturnType<typeof prisma.message.create>> | null = null;
  try {
    created = await prisma.message.create({
      data: {
        idempotencyKey,
        conversationId,
        workspaceId: job.workspaceId,
        // SYSTEM, not AGENT: this isn't the agent speaking, it's the mirror
        // layer reporting an infrastructure-level fact about the run. Keeps
        // authorAgentId honestly null and matches Paperclip's pattern.
        role: "SYSTEM",
        authorAgentId: null,
        agentJobId: job.id,
        // Attribute the synthetic "no output" marker to whichever step the
        // failed run was credited to, so EMPTY_RESPONSE shows up under the
        // right step in any future grouped view.
        workflowStepRunId: job.workflowStepRunId ?? null,
        body,
        status: "ERROR",
      },
    });
  } catch (err) {
    // Unique constraint race against a concurrent terminal call — fine, the
    // other writer already inserted the row.
    logger.warn("mirror.outcome.message.create.failed", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await publishWorkspaceEvent(job.workspaceId, {
    name: "message.created",
    workspaceId: job.workspaceId,
    conversationId,
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
    by: "system",
  });
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
  // Classify the run and surface EMPTY_RESPONSE as a SYSTEM message before
  // tearing down WireState — the counters live on the state object.
  await persistTerminalOutcome(job, state.conversationId, status, {
    textChars: state.textChars,
    toolUses: state.toolUses,
  });
  clearWireState(job.id);
}

async function resolveTerminalStepRunId(job: AgentJob): Promise<string | null> {
  if (!job.ticketId) return job.workflowStepRunId ?? null;
  const lastUser = await prisma.message
    .findFirst({
      where: { agentJobId: job.id, role: "USER" },
      orderBy: { createdAt: "desc" },
      select: { body: true, workflowStepRunId: true },
    })
    .catch(() => null);
  if (lastUser?.workflowStepRunId) return lastUser.workflowStepRunId;
  if (job.workflowStepRunId) return job.workflowStepRunId;

  const stepName = lastUser?.body?.match(/^\[Workflow(?:\s+\d+\/\d+)?:\s*([^\]]+)\]/)?.[1]?.trim();
  if (!stepName) return null;
  const candidate = await prisma.workflowStepRun
    .findFirst({
      where: {
        name: stepName,
        status: { in: ["PENDING", "RUNNING"] },
        run: { ticketId: job.ticketId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    .catch(() => null);
  return candidate?.id ?? null;
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

  // Fail/cancel the linked WorkflowStepRun so the panel stops showing the
  // step as in-progress when the underlying job died. SUCCEEDED is handled
  // per-turn by persistTurnEnd — a single AgentJob can span multiple
  // workflow steps (warm-send), so we don't close stepRun=SUCCEEDED here.
  if (args.status !== "SUCCEEDED") {
    const stepRunId = await resolveTerminalStepRunId(args.job);
    if (!stepRunId) return;
    await workflowCommander
      .completeStep({
        stepRunId,
        jobId: args.job.id,
        result: "failure",
        error: args.status === "CANCELED" ? "Agent job canceled" : "Agent job failed",
      })
      .catch(() => undefined);
  }
}
