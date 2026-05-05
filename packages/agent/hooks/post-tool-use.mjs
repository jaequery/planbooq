#!/usr/bin/env node
// Claude Code PostToolUse hook for Planbooq.
// Reads a JSON event on stdin, scans Bash tool output for notable events
// (PR created, push, test/build runs), and POSTs them to the Planbooq
// activity endpoint. Fire-and-forget — never blocks Claude.

import { readFileSync } from "node:fs";

const SERVER = process.env.PLANBOOQ_SERVER;
const TOKEN = process.env.PLANBOOQ_TOKEN;
const JOB_ID = process.env.PLANBOOQ_JOB_ID;
if (!SERVER || !TOKEN || !JOB_ID) process.exit(0);

let raw;
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}
let evt;
try {
  evt = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = evt.tool_name ?? evt.toolName ?? "";
if (tool !== "Bash") process.exit(0);

const cmd = String(evt.tool_input?.command ?? evt.toolInput?.command ?? "");
const out = String(
  evt.tool_response?.stdout ?? evt.tool_response?.output ?? evt.toolResponse?.stdout ?? "",
);
const stderr = String(evt.tool_response?.stderr ?? evt.toolResponse?.stderr ?? "");
const combined = `${out}\n${stderr}`;

const events = [];

// gh pr create -> capture URL from output
if (/\bgh\s+pr\s+create\b/.test(cmd)) {
  const m = combined.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if (m) events.push({ kind: "PR_CREATED", payload: { url: m[0], command: cmd } });
}

// git push
if (/\bgit\s+push\b/.test(cmd)) {
  const branchMatch = combined.match(/->\s*([^\s]+)/);
  events.push({
    kind: "COMMIT_PUSHED",
    payload: { command: cmd, branch: branchMatch?.[1] ?? null },
  });
}

// test runs (npm test, pnpm test, jest, vitest, pytest, go test, cargo test)
if (/\b(npm|pnpm|yarn)\s+(run\s+)?(test|typecheck)\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b/.test(cmd)) {
  events.push({
    kind: "TEST_RUN",
    payload: {
      command: cmd,
      passed: !/(?:FAIL|failed|error TS|exited with code [1-9])/i.test(combined),
    },
  });
}

// builds
if (/\b(npm|pnpm|yarn)\s+(run\s+)?build\b|\bnext\s+build\b|\bcargo\s+build\b/.test(cmd)) {
  events.push({
    kind: "BUILD",
    payload: {
      command: cmd,
      passed: !/(error|failed|exited with code [1-9])/i.test(combined),
    },
  });
}

if (events.length === 0) process.exit(0);

await Promise.all(
  events.map((e) =>
    fetch(new URL(`/api/agents/jobs/${JOB_ID}/activity`, SERVER).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(e),
    }).catch(() => {}),
  ),
);
process.exit(0);
