# @planbooq/agent

Local Planbooq agent. Runs on your machine, talks to Planbooq over Ably,
and executes `claude -p` against a local repo when a ticket is dispatched
to this machine. Uses your existing Claude Code CLI subscription — no API
key required.

## Prerequisites

- Node 20+
- The `claude` CLI installed and logged in (`claude /login`)

## Setup

```bash
cd packages/agent
pnpm install
node bin/planbooq-agent.mjs login
```

You'll be asked for:

1. Planbooq URL (default `http://localhost:3636`)
2. The 8-char pair code shown in **Settings → Agents → Pair new agent**
3. The workspace id to attach this machine to
4. The repo root that jobs should run in

Credentials are stored at `~/.planbooq/agent.json` (mode 0600).

## Run

```bash
node bin/planbooq-agent.mjs start
```

The agent connects, subscribes to its private channel, and waits for
jobs. When a ticket fires "Run on my machine", `claude -p "<prompt>"`
runs in the configured repo root and stdout/stderr stream back to the
ticket UI.
