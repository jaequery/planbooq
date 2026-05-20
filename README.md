# Planbooq

> The cockpit for vibe coders running ten tickets at once. Built for speed.

## Overview

Planbooq is a desktop kanban built ground-up for velocity. It is the visual surface vibe coders use to drop tickets, run them through AI agents in their own worktrees, and ship — without babysitting one terminal at a time.

The bottleneck of vibe coding is not writing code. It is *throughput* — how many useful changes you can land per hour. Sequential prompt-and-iterate kills that throughput; you stare at one terminal while nine others sit idle. Planbooq pushes every ticket through its own lane, so the time you used to spend waiting becomes time spent reviewing the next thing.

Think of it as the offspring of **Cursor + Linear + Notion**, collapsed into one fast desktop surface — the AI productivity of Cursor, the ticket discipline of Linear, the calm visual order of Notion — built ground-up for velocity.

## Features

- **Multi-task throughput** — run dozens of tickets in parallel; no more babysitting a single agent
- **Isolated worktrees per ticket** — every ticket runs on its own branch and worktree, so tickets never step on each other
- **Real-time multiplayer kanban** — simultaneous editing, live status, no stale board
- **Full keyboard navigation & cmd-K palette** — every action in milliseconds, never reach for the mouse
- **GitHub-wired tickets** — branches, PRs, CI status flow back to the board; merged PR auto-completes the ticket
- **BYOK (bring your own Anthropic key)** — you control the meter; no vendor lock-in
- **Customizable statuses and automation** — per-workspace configuration

## Getting Started

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm db:migrate     # apply schema
pnpm db:seed        # optional — demo workspace + tickets
pnpm dev            # http://localhost:3636
pnpm desktop        # desktop shell (separate terminal)
```

Copy `.env.example` to `.env.local` for environment variables. See [`docs/`](docs/) for OAuth, Inngest, Ably, and webhook configuration.

## Project Structure

### Workspaces & Projects

Each user gets one hidden workspace, auto-provisioned on first sign-in. Inside that workspace, work is organized into **projects** — each with its own kanban board at `/p/<project-slug>`. Projects share statuses at the workspace level.

The first sign-in creates a default `Untitled` project. Add more from the sidebar `+` button. The seed populates two projects (`planbooq` and `side-experiment`) with sample tickets for sidebar navigation.

### Default Statuses

| Status      | Meaning |
| ----------- | ------- |
| `backlog`   | Captured, not yet committed to. |
| `todo`      | Scoped and ready. Queued for a worker. |
| `building`  | Agent is running on the ticket. |
| `review`    | Output ready. Waiting on you to glance and ship. |
| `completed` | Merged and deployed. |

Statuses are customizable per workspace.

### Project Context

Planbooq treats every connected repo's living knowledge as a first-class concern. Four canonical artifacts make up a project's **Project Context** — Workers read them on every ticket, refine them in-PR, and humans ship knowledge alongside code:

- [`CONTEXT.md`](CONTEXT.md) — the project glossary.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`AGENTS.md`](AGENTS.md) — coding conventions for AI agents (open standard; `CLAUDE.md` symlinks here).
- [`docs/learnings.md`](docs/learnings.md) — append-only stream of surprising durable facts surfaced by past tickets.

See [`docs/README.md`](docs/README.md) for the full documentation map, and [`docs/adr/0001-project-context-files-are-canonical.md`](docs/adr/0001-project-context-files-are-canonical.md) for the design.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict, `noUncheckedIndexedAccess`)
- **Styling:** Tailwind v4, shadcn/ui (Radix primitives), lucide-react
- **Code Quality:** Biome (linting + formatting), TypeScript strict mode
- **Backend:** Postgres 16, Prisma 7 (with `@prisma/adapter-pg`)
- **Auth:** Auth.js v5 (GitHub OAuth)
- **Jobs & Events:** Inngest v4
- **Real-time:** Ably
- **Env Validation:** `@t3-oss/env-nextjs`
- **UI Utilities:** next-themes, sonner

## Status & Roadmap

**Status:** Early. Closed alpha. Building toward public beta. The product roadmap is tracked in Planbooq itself.

**Pricing:** TBD. Likely BYOK + flat platform fee, with a hosted-compute tier for users who don't want to manage their own keys.

## Who It's For

Vibe coders running parallel AI sessions who feel the cost of sequential iteration in wall-clock minutes. If you already have 3+ Claude Code / Cursor / Lovable sessions in different terminals and your bottleneck is *attention*, not *typing*, this is built for you.

## Contributing

We welcome contributions. Please open an issue or pull request — the codebase is strict TypeScript, linted with Biome, and contributions should pass `pnpm typecheck` and `pnpm lint:fix`.

## License

[See LICENSE file](LICENSE)
