# Planbooq

> The cockpit for vibe coders running ten tickets at once. Built for speed.

## Overview

Planbooq is a desktop kanban built ground-up for velocity. It is the visual surface vibe coders use to drop tickets, fan them out across parallel AI workers, and ship — without ever waiting on a single agent.

The bottleneck of vibe coding is not writing code. It is *throughput* — how many useful changes you can land per hour. Sequential prompt-and-iterate kills that throughput; you stare at one terminal while nine others sit idle. Planbooq pumps every ticket through the same lane in parallel, so the time you used to spend waiting becomes time spent reviewing the next thing.

Think of it as the offspring of **Cursor + Linear + Notion**, collapsed into one fast desktop surface — the AI productivity of Cursor, the ticket discipline of Linear, the calm visual order of Notion — built ground-up for velocity.

## Features

- **Multi-task throughput** — run dozens of tickets in parallel; no more babysitting a single agent
- **Parallel AI workers per ticket** — N variants generate at once in isolated worktrees, so wall-clock per ticket drops to whatever the slowest worker takes
- **Token-efficient by default** — generate once, in parallel, instead of burning tokens on serial re-prompts
- **Live preview URLs & screenshots** — review and decide in one click, never re-run the loop
- **Real-time multiplayer kanban** — simultaneous editing, live status, no stale board
- **Full keyboard navigation & cmd-K palette** — every action in milliseconds, never reach for the mouse
- **GitHub-wired tickets** — branches, PRs, CI status flow back to the board; merged PR auto-completes the ticket
- **BYOK (bring your own Anthropic key)** — fan-out is cheap when you control the meter; no vendor lock-in
- **Customizable statuses, worker count, and automation** — per-workspace configuration

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
| `building`  | Workers running in parallel. |
| `review`    | Output ready. Waiting on you to glance and ship. |
| `completed` | Merged and deployed. |

Statuses and worker count are customizable per workspace.

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
