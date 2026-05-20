# AGENTS.md

Conventions and rules for AI coding agents (Workers) operating on this repository. This file is the canonical entry point under the [AGENTS.md](https://agents.md) standard; `CLAUDE.md` is a symlink to it.

## Reading list — read these before acting

This file alone is not the full Project Context. Before writing code or proposing changes, read:

1. **`CONTEXT.md`** — the project glossary. Use the exact terms defined there; do not invent synonyms.
2. **The latest five ADRs in `docs/adr/`** by modification time — load-bearing decisions you must not silently re-litigate.
3. **`docs/learnings.md`** — surprising durable facts surfaced by past tickets.
4. **`.planbooq/codebase-snapshot.md`** (if present) — disposable, regenerated at worktree creation; gives you a "where things live" map.

If any of these files is missing, proceed but note the gap in your final summary.

## Project

Planbooq is a desktop kanban platform for vibe coding in the age of parallel AI code generation. Its core thesis: **the bottleneck has moved from writing code to running, reviewing, and shipping AI-generated output**. One terminal at a time is broken. Planbooq fixes it by giving every ticket its own branch, worktree, and AI agent session so a single human can keep many tickets moving at once instead of babysitting one.

Positioned to replace Lovable + Cursor + Linear with one surface optimized for running many tickets and shipping them.

See `README.md` for the full pitch and the default workflow (`backlog` → `todo` → `building` → `review` → `completed`).

## Core product concepts

- **One ticket, one Worker.** A ticket runs through a single AI agent session in its own branch and worktree. Throughput comes from running many tickets in parallel, not from fanning a single ticket out.
- **Tickets are GitHub-shaped.** A ticket has a branch, optionally a PR, and CI status flowing back to the board. Merge auto-completes the ticket.
- **Review = glance + ship.** When a ticket lands in `review`, the human's job is to look at the diff/PR and either ship or send it back. The UI optimizes for the glance.
- **BYOK is the default.** Bring-your-own-key keeps unit economics user-controlled; hosted compute is a premium tier.
- **Files are canonical.** Project Context lives in the repo, not in Planbooq's DB. Workers see context by reading files in the worktree; Planbooq mirrors but never injects at runtime. See [ADR-0001](docs/adr/0001-project-context-files-are-canonical.md) and [ADR-0007](docs/adr/0007-project-context-is-project-scoped-at-runtime.md).

## Tech stack

- **Framework:** Next.js (App Router) + React 19
- **Language/lint:** TypeScript, Biome
- **DB:** Postgres + Prisma 7 (`prisma/schema.prisma`)
- **Auth:** NextAuth v5 beta (database sessions, magic-link via Nodemailer)
- **Realtime:** Ably (`src/server/ably.ts`, channel `workspace:{id}`)
- **Async/jobs:** Inngest (`src/server/inngest`)
- **UI:** Radix + Tailwind 4 + dnd-kit + react-hook-form + zod
- **Package manager:** pnpm

## Commands

- `pnpm dev` — Next dev server on **port 3636**
- `pnpm build` / `pnpm start`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` — Biome
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` / `pnpm db:generate`
- `pnpm inngest` — Inngest dev runner against `http://localhost:3636/api/inngest`
- No test framework wired up yet.

## Architecture

- **Domain models** (`prisma/schema.prisma`): `Workspace → Project → Ticket`, plus `Status` (kanban columns), `Label`, `Member` (workspace-scoped role), and Auth.js v5 standard tables. `Ticket.position` is a float so DnD reorder writes a midpoint between anchors.
- **Mutation flow:** UI → server actions in `src/actions/*.ts` → Prisma → `publishWorkspaceEvent` (Ably) + `inngest.send` (background) → `revalidatePath`. Errors return `ServerActionResult<T>` (`{ ok, data | error }`).
- **REST API (v0):** `docs/api.md` + `docs/openapi.yaml` specify a Bearer-token (`pbq_live_…`) HTTP surface that mirrors the server actions, intended for Claude skills and external automations. Handlers live under `src/app/api/v1/**` and share a service layer (`src/server/services/*`) with the server actions.
- **Realtime:** Ably channel per workspace; clients mint tokens via `/api/ably/token`. Event shapes are typed in `src/lib/types.ts` (`AblyChannelEvent`).
- **Auth bootstrap:** on first sign-in, `ensurePersonalWorkspace` (`src/server/auth.ts`) provisions a personal workspace with default statuses (`src/lib/default-statuses.ts`) and an "Untitled" project.

## Worker rules for Project Context

When you have insights worth promoting into Project Context, edit the canonical files directly as additional commits on this ticket's branch, **prefixed `context:`** so the reviewer (and Planbooq's merge UI) can ship code and context independently. See [ADR-0003](docs/adr/0003-workers-refine-context-in-pr.md).

- New glossary terms → append to `CONTEXT.md`.
- New decisions → add a new file under `docs/adr/` in `proposed` status. **Do not** promote your own ADRs to `accepted` — that is a human act. **Filename:** use a UTC date prefix, `YYYY-MM-DD-slug.md` (extend with `-HHmm` if a same-day collision is likely). Do not use an incrementing counter — concurrent tickets racing on the same integer cause merge collisions. Legacy ADRs (`0001-`...`0008-`) keep their existing names. See [`docs/adr/2026-05-20-adr-files-use-date-prefix.md`](docs/adr/2026-05-20-adr-files-use-date-prefix.md).
- Convention or anti-pattern → edit `AGENTS.md`.
- Surprising durable facts (rate limits, library quirks, gotchas) → append to `docs/learnings.md`. This file is **append-only**; do not rewrite prior entries.
- Never edit `.planbooq/codebase-snapshot.md` — it is regenerated at worktree creation and never committed.
