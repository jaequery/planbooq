# Planbooq

> The kanban for vibe coding. Pick winners, don't prompt twice.

## Overview

Planbooq is a SaaS kanban platform built for the age of AI-generated code. Every ticket spawns multiple AI variants in parallel — each with a live preview URL and screenshots — so you decide by *picking*, not by re-prompting.

The old vibe coding loop is broken. Sequential iteration (prompt → wait → "almost but not quite" → re-prompt) is exhausting, lossy, and fights how humans actually evaluate creative work. We don't *specify* taste — we *recognize* it.

Planbooq collapses Lovable, Cursor, and Linear into a single surface optimized for the new bottleneck: **deciding fast on AI output**. Drop a ticket, watch N variants build in parallel, test-drive each with live previews, pick the winner in one click, ship.

## Features

- **Parallel AI variant generation** — 3–5 variants per ticket (tunable), each in an isolated worktree
- **Live preview URLs & screenshots** — click to test-drive, auto-captured diffs
- **One-click "pick winner"** — merge the chosen variant, archive the rest
- **Variant remix** — combine elements from multiple attempts
- **Real-time multiplayer kanban** — simultaneous editing, live status updates
- **Full keyboard navigation & cmd-K palette** — distraction-free workflow
- **BYOK (bring your own Anthropic key)** — cost-controlled, no vendor lock-in
- **GitHub integration** — branches, PRs, CI status wired to tickets; auto-complete when PR merges
- **Taste learning** — the platform gets smarter at picking the right N variants based on your picks
- **Customizable statuses, variant count, and automation** — per-workspace configuration

## Getting Started

### Requirements

- Node 20+
- pnpm 10+

### Installation & Local Dev

```bash
pnpm install
pnpm dev          # http://localhost:3636
```

**Ports:**
- App: **3636**
- Postgres: **5656**

**Environment:**  
Copy `.env.example` to `.env.local` and fill values as you go (Backend wires them up in Wave 2).

### Common Scripts

- `pnpm dev` — Next.js dev server on port 3636
- `pnpm build` / `pnpm start` — production build & serve
- `pnpm typecheck` — `tsc --noEmit` with strict config
- `pnpm lint` / `pnpm lint:fix` — Biome lint + auto-organize imports
- `pnpm format` — Biome formatter
- `pnpm db:migrate` — `prisma migrate dev`
- `pnpm db:seed` — run `prisma/seed.ts` (idempotent, seeds demo workspace + tickets)
- `pnpm db:reset` — wipe and re-migrate (dev only)
- `pnpm db:generate` — regenerate Prisma client

### Backend Setup (Wave 2A)

```bash
cp .env.example .env
docker compose up -d                          # Postgres on :5656
pnpm install
pnpm db:migrate
pnpm db:seed
# Terminal 2:
pnpm dlx inngest-cli@latest dev               # http://localhost:8288
# Terminal 1:
pnpm dev                                      # http://localhost:3636
```

**Auth setup:**  
GitHub OAuth is required. Create an OAuth app at https://github.com/settings/developers with callback URL `$NEXTAUTH_URL/api/auth/callback/github`. Set `GITHUB_ID` and `GITHUB_SECRET` in `.env`.

**Inngest dev server:**  
Runs on http://localhost:8288. The SDK fails gracefully when `INNGEST_SIGNING_KEY` is empty as long as `INNGEST_DEV=1` is set (included in `.env.example`).

**Ably (optional):**  
`ABLY_API_KEY` is optional in dev. The token endpoint returns `503 ably_not_configured` and publish helpers no-op when missing — rest of the app keeps working.

**GitHub webhook:**  
Tickets auto-move to `Completed` when their linked PR merges. Set `GITHUB_WEBHOOK_SECRET` in `.env` and configure webhooks on repos — see [`docs/github-webhook.md`](docs/github-webhook.md).

**Production considerations:**  
`AUTH_TRUST_HOST` is auto-true in dev. On real production deploys, set `INNGEST_REQUIRED=true` to enforce Inngest request signing.

## Project Structure

### Workspaces & Projects

Each user gets one hidden workspace, auto-provisioned on first sign-in. Inside that workspace, work is organized into **projects** — each with its own kanban board at `/p/<project-slug>`. Projects share statuses at the workspace level.

The first sign-in creates a default `Untitled` project. Add more from the sidebar `+` button. The seed populates two projects (`planbooq` and `side-experiment`) with sample tickets for sidebar navigation.

### Default Statuses

| Status      | Meaning |
| ----------- | ------- |
| `backlog`   | Captured, not yet committed to. |
| `todo`      | Scoped and ready. Queued for an agent. |
| `building`  | N variants generating in parallel. |
| `review`    | Variants ready. Waiting on you to pick. |
| `completed` | Merged and deployed. |

Statuses and variant count are customizable per workspace.

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

Solo builders and small teams running parallel AI coding workflows who feel the pain of sequential iteration. If you're already running 3+ Claude Code / Cursor / Lovable sessions in different terminals and copy-pasting screenshots into Slack-to-self, this is built for you.

## Contributing

We welcome contributions. Please open an issue or pull request — the codebase is strict TypeScript, linted with Biome, and contributions should pass `pnpm typecheck` and `pnpm lint:fix`.

## License

[See LICENSE file](LICENSE)