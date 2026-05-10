#!/usr/bin/env node
// One-off backfill: legacy SYSTEM messages whose body is a WireEvent JSONL
// transcript (one Message per AgentJob) get re-parsed into proper per-turn
// USER, AGENT (and SYSTEM-style tool-call) rows that match the new mirror's
// idempotency-key scheme. The legacy wrapper rows are left in place — the
// conversation renderer hides them via a body-shape filter — so this script
// is idempotent and safe to re-run.
//
// Usage:
//   DATABASE_URL=... node scripts/backfill-wire-messages.mjs [--dry-run]

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const reset = process.argv.includes("--reset");
// --from-jobs walks AgentJob rows directly. Use this to backfill conversations
// for tickets whose chat history existed only as AgentJob.output and never
// got mirrored into Message rows (i.e. anything older than the mirror layer).
const fromJobs = process.argv.includes("--from-jobs");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function parseClaudeLine(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function formatToolUse(name, input) {
  if (!input) return `→ ${name}`;
  const pick = (k) => (typeof input[k] === "string" ? input[k] : "");
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
  }
  const trimmed = arg.length > 200 ? `${arg.slice(0, 197)}…` : arg;
  return trimmed ? `→ ${name}: ${trimmed}` : `→ ${name}`;
}

// Three entry points share `parseEventsToWrites`:
//   backfillMessage(legacy)  — re-parse a legacy SYSTEM wrapper Message whose
//                              body is the raw WireEvent JSONL.
//   backfillJob(job)         — re-parse an AgentJob.output blob directly,
//                              for jobs that predate the mirror and have no
//                              wrapper Message at all (the actual root cause
//                              of "where did my chat history go?").
function parseRawEvents(body) {
  const events = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return events;
}

async function backfillMessage(legacy) {
  const job = await prisma.agentJob.findUnique({
    where: { id: legacy.agentJobId },
    select: {
      id: true,
      ticketId: true,
      workspaceId: true,
      userId: true,
      agentId: true,
      kind: true,
      status: true,
      createdAt: true,
    },
  });
  if (!job) return { skipped: "no_job" };
  if (job.kind === "PLAN") return { skipped: "plan_kind" };
  return parseAndWrite(job, legacy.body, legacy.conversationId);
}

async function backfillJob(job) {
  if (job.kind === "PLAN") return { skipped: "plan_kind" };
  if (!job.output || job.output.length === 0) return { skipped: "empty_output" };
  if (!job.ticketId || !job.workspaceId) return { skipped: "no_ticket" };
  // Get-or-create the per-ticket conversation. Mirrors
  // src/server/services/conversations.ts but inlined to avoid TS imports.
  const conv = await prisma.conversation.upsert({
    where: { ticketId: job.ticketId },
    create: { ticketId: job.ticketId, workspaceId: job.workspaceId },
    update: {},
    select: { id: true },
  });
  return parseAndWrite(job, job.output, conv.id);
}

async function parseAndWrite(job, body, conversationId) {
  const events = parseRawEvents(body);

  let userSeq = 0;
  let agentTurnSeq = 0;
  let toolSeq = 0;
  let agentBuffer = "";
  let agentOpenAt = null;
  let agentSealedByAssistant = false;
  const writes = [];

  const flushAgent = (at) => {
    if (!agentBuffer) {
      agentOpenAt = null;
      agentSealedByAssistant = false;
      return;
    }
    const seq = agentTurnSeq++;
    writes.push({
      idempotencyKey: `agent-job:${job.id}:asst:${seq}`,
      conversationId: null, // resolved below
      workspaceId: job.workspaceId,
      role: job.agentId ? "AGENT" : "SYSTEM",
      authorAgentId: job.agentId ? job.agentId : null,
      authorUserId: null,
      agentJobId: job.id,
      body: agentBuffer,
      status: "COMPLETE",
      createdAt: new Date(agentOpenAt ?? at ?? job.createdAt),
    });
    agentBuffer = "";
    agentOpenAt = null;
    agentSealedByAssistant = false;
  };

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const at = typeof ev.at === "number" ? ev.at : undefined;
    if (ev.kind === "user" && typeof ev.text === "string") {
      flushAgent(at);
      const seq = userSeq++;
      writes.push({
        idempotencyKey: `agent-job:${job.id}:user:${seq}`,
        conversationId: null,
        workspaceId: job.workspaceId,
        role: "USER",
        authorAgentId: null,
        authorUserId: job.userId ?? null,
        agentJobId: job.id,
        body: ev.text,
        status: "COMPLETE",
        createdAt: new Date(at ?? job.createdAt),
      });
    } else if (ev.kind === "agent" && typeof ev.line === "string") {
      const parsed = parseClaudeLine(ev.line);
      if (!parsed) continue;
      if (parsed.type === "stream_event" && parsed.event) {
        if (agentSealedByAssistant) continue;
        const inner = parsed.event;
        if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta") {
          if (!agentOpenAt) agentOpenAt = at ?? null;
          if (typeof inner.delta.text === "string") agentBuffer += inner.delta.text;
        } else if (
          inner.type === "content_block_start" &&
          inner.content_block?.type === "text" &&
          typeof inner.content_block.text === "string"
        ) {
          if (!agentOpenAt) agentOpenAt = at ?? null;
          agentBuffer += inner.content_block.text;
        }
      } else if (parsed.type === "assistant" && parsed.message) {
        const blocks = parsed.message.content ?? [];
        for (const b of blocks) {
          if (b.type === "text" && typeof b.text === "string" && b.text) {
            if (!agentOpenAt) agentOpenAt = at ?? null;
            if (agentSealedByAssistant) {
              agentBuffer += b.text;
            } else {
              agentBuffer = b.text;
              agentSealedByAssistant = true;
            }
          } else if (b.type === "tool_use" && typeof b.name === "string") {
            flushAgent(at);
            const seq = toolSeq++;
            writes.push({
              idempotencyKey: `agent-job:${job.id}:tool:${seq}`,
              conversationId: null,
              workspaceId: job.workspaceId,
              role: job.agentId ? "AGENT" : "SYSTEM",
              authorAgentId: job.agentId ? job.agentId : null,
              authorUserId: null,
              agentJobId: job.id,
              body: formatToolUse(b.name, b.input),
              status: "COMPLETE",
              createdAt: new Date(at ?? job.createdAt),
            });
          }
        }
      } else if (parsed.type === "result") {
        flushAgent(at);
      }
    } else if (ev.kind === "exit") {
      flushAgent(at);
    }
  }
  flushAgent(undefined);

  if (writes.length === 0) return { skipped: "no_turns" };

  // Several events share the same `at` (or fall back to job.createdAt) — to
  // preserve the order they came in, nudge each write 1ms past the previous
  // when the timestamps tie. Conversation-thread sorts by createdAt asc.
  let lastMs = 0;
  for (const w of writes) {
    w.conversationId = conversationId;
    const ms = w.createdAt.getTime();
    const adjusted = ms <= lastMs ? lastMs + 1 : ms;
    w.createdAt = new Date(adjusted);
    lastMs = adjusted;
  }

  if (dryRun) {
    return { wouldWrite: writes.length, jobId: job.id };
  }

  let inserted = 0;
  for (const w of writes) {
    try {
      await prisma.message.upsert({
        where: { idempotencyKey: w.idempotencyKey },
        create: w,
        update: {},
      });
      inserted += 1;
    } catch (err) {
      console.error("upsert.failed", w.idempotencyKey, err.message);
    }
  }
  return { inserted, jobId: job.id };
}

async function main() {
  if (reset) {
    // Wipe any prior backfill output so a re-run produces clean rows. Only
    // touches keys this script owns; legacy SYSTEM wrappers are left alone.
    const removed = await prisma.message.deleteMany({
      where: {
        OR: [
          { idempotencyKey: { contains: ":asst:" } },
          { idempotencyKey: { contains: ":tool:" } },
          { idempotencyKey: { contains: ":user:" } },
        ],
      },
    });
    console.log(`reset: removed ${removed.count} prior backfill rows`);
  }

  // Match anything that begins with a WireEvent envelope; the regex on the
  // server-side renderer is the source of truth for "this is a legacy row."
  const legacy = await prisma.message.findMany({
    where: {
      role: "SYSTEM",
      agentJobId: { not: null },
      body: { startsWith: '{"kind":"' },
    },
    select: {
      id: true,
      conversationId: true,
      agentJobId: true,
      body: true,
    },
    take: 1000,
  });
  console.log(`found ${legacy.length} legacy wrapper messages`);
  let totalInserted = 0;
  for (const m of legacy) {
    const r = await backfillMessage(m);
    console.log(m.id, "→", r);
    if (r.inserted) totalInserted += r.inserted;
  }
  console.log(`done. ${dryRun ? "would write" : "inserted"} ${totalInserted} turn rows.`);

  if (fromJobs) {
    // Walk AgentJob rows that have output but no Messages tied to them. The
    // upserts inside parseAndWrite are idempotent on idempotencyKey, so this
    // is also safe to re-run if some jobs already have partial coverage.
    const candidates = await prisma.agentJob.findMany({
      where: {
        kind: { not: "PLAN" },
        output: { not: "" },
        ticketId: { not: undefined },
        workspaceId: { not: null },
      },
      select: {
        id: true,
        ticketId: true,
        workspaceId: true,
        userId: true,
        agentId: true,
        kind: true,
        status: true,
        output: true,
        createdAt: true,
      },
      take: 5000,
    });
    console.log(`from-jobs: scanning ${candidates.length} AgentJob rows`);
    let jobInserts = 0;
    for (const j of candidates) {
      // Skip jobs that already have a non-trivial Message presence — cheap
      // count() avoids re-parsing fully-mirrored conversations.
      const existing = await prisma.message.count({ where: { agentJobId: j.id } });
      if (existing > 0) {
        // Already covered (either by mirror or by the legacy backfill above).
        continue;
      }
      const r = await backfillJob(j);
      console.log(j.id, "→", r);
      if (r.inserted) jobInserts += r.inserted;
    }
    console.log(`from-jobs done. ${dryRun ? "would write" : "inserted"} ${jobInserts} turn rows.`);
  }

  await prisma.$disconnect();
}

await main();
