# Planbooq

> The kanban for vibe coding. Pick winners, don't prompt twice.

Planbooq is a SaaS kanban platform built for the age of AI-generated code. Every ticket spawns multiple AI variants in parallel — each with a live preview URL and screenshots — so you decide by *picking*, not by re-prompting.

## The Bottleneck Has Moved

AI can write code 100x faster than you can review and direct it. The old vibe coding loop is broken:

> Prompt → wait → "almost but not quite" → re-prompt → wait → "closer" → re-prompt → ship something you settled for.

Sequential iteration is exhausting, lossy, and fights how humans actually evaluate creative work. We don't *specify* taste — we *recognize* it.

## How Planbooq Works

1. **Drop a ticket on the board.** Describe what you want — UI, feature, fix, refactor.
2. **AI runs N variants in parallel.** Each variant gets its own isolated environment, branch, and preview URL.
3. **Test-drive each variant.** Live preview pages, screenshots, real URLs. Click around. Feel them.
4. **Pick the winner, hot-or-not style.** One click. The winner ships. The losers are discarded.
5. **Repeat.** Multiple tickets, multiple variants, all in flight at once. Your kanban becomes a parallel decision engine.

## Why This Replaces Lovable + Cursor + Linear

Today's vibe coder bounces between three tools that were built for three different eras:

- **Lovable / Bolt / v0** — great at zero-to-one generation, but iteration is sequential and you lose context across regenerations.
- **Cursor** — great at refinement, but you're still driving one cursor through one file at a time.
- **Linear** — beautiful tracker, but assumes humans assign humans. It has no concept of an AI agent that produces five candidate solutions.

Planbooq collapses all three into a single surface optimized for the *new* bottleneck: **deciding fast on AI output**.

## Core Loop

| Step           | What you do                          | What Planbooq does                                  |
| -------------- | ------------------------------------ | --------------------------------------------------- |
| Capture        | Describe the ticket.                 | Detects whether the work is taste-driven or logic-driven and picks N. |
| Parallel build | Nothing — go make coffee.            | Spawns N agents in isolated worktrees.              |
| Preview        | Click each variant.                  | Deploys live previews, captures screenshots, surfaces diffs. |
| Decide         | Pick the winner. Or remix variants.  | Merges the winner, archives the rest, learns your taste. |
| Ship           | Approve.                             | Opens the PR, runs CI, deploys.                     |

## Default Statuses

| Status        | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `backlog`     | Captured, not yet committed to.                          |
| `planning`    | Scoping — agent or human shaping the work.               |
| `building`    | N variants generating in parallel.                       |
| `review`      | Variants ready. Waiting on you to pick.                  |
| `shipping`    | Winner picked. PR open, CI running.                      |
| `completed`   | Merged and deployed.                                     |

Statuses, variant count, and automation hooks are fully customizable per workspace.

## Features

- Parallel AI variant generation per ticket (3–5 by default, tunable)
- Live preview URLs and auto-captured screenshots for every variant
- Side-by-side variant comparison and one-click "pick winner"
- Variant remix — combine elements from multiple winners
- Real-time multiplayer kanban
- Cmd-K command palette, full keyboard navigation
- BYOK (bring your own Anthropic key) for cost-controlled scaling
- GitHub integration: branches, PRs, CI status all wired to tickets
- Taste learning — the platform gets sharper at picking the right N variants based on what you historically choose

## Who It's For

Solo builders and small teams running parallel AI coding workflows who feel the pain of sequential iteration. If you're already running 3+ Claude Code / Cursor / Lovable sessions in different terminals and copy-pasting screenshots into Slack-to-self, this is built for you.

## Status

Early. Closed alpha. Building toward a public beta. The product roadmap is tracked in Planbooq itself.

## Pricing

TBD. Likely BYOK + flat platform fee, with a hosted-compute tier for users who don't want to manage their own keys.
