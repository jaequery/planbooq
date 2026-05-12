# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Planbooq is a SaaS kanban platform for vibe coding in the age of parallel AI code generation. Its core thesis: **the bottleneck has moved from writing code to running, reviewing, and shipping AI-generated output**. One terminal at a time is broken. Planbooq fixes it by giving every ticket its own branch, worktree, and AI agent session, so a single human can keep many tickets moving at once instead of babysitting one.

It is positioned to replace the current vibe coding stack (Lovable + Cursor + Linear) with a single surface optimized for running many tickets and shipping them, not for writing one at a time.

See `README.md` for the full pitch and the default workflow (`backlog` → `todo` → `building` → `review` → `completed`).

## Core Product Concepts

When reasoning about features or architecture, keep these concepts central:

- **One ticket, one worker.** A ticket runs through a single AI agent session in its own branch and worktree. Throughput comes from running many tickets in parallel, not from fanning a single ticket out.
- **Tickets are GitHub-shaped.** A ticket has a branch, optionally a PR, and CI status flowing back to the board. Merge auto-completes the ticket.
- **Review = glance + ship.** When a ticket lands in `review`, the user's job is to look at the diff/PR and either ship or send it back. The UI optimizes for the glance.
- **BYOK is the default.** Bring-your-own-key keeps unit economics user-controlled; hosted compute is a premium tier.

## Tech Stack

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

- **Domain models** (`prisma/schema.prisma`): `Workspace → Project → Ticket`,
  plus `Status` (kanban columns), `Label`, `Member` (workspace-scoped role),
  and Auth.js v5 standard tables. `Ticket.position` is a float so DnD
  reorder writes a midpoint between anchors.
- **Mutation flow:** UI → server actions in `src/actions/*.ts` → Prisma →
  `publishWorkspaceEvent` (Ably) + `inngest.send` (background) →
  `revalidatePath`. Errors return `ServerActionResult<T>` (`{ ok, data | error }`).
- **REST API (v0):** `docs/api.md` + `docs/openapi.yaml` specify a
  Bearer-token (`pbq_live_…`) HTTP surface that mirrors the server
  actions, intended for Claude skills and external automations.
  Handlers live under `src/app/api/v1/**` and share a service layer
  (`src/server/services/*`) with the server actions.
- **Realtime:** Ably channel per workspace; clients mint tokens via
  `/api/ably/token`. Event shapes are typed in `src/lib/types.ts`
  (`AblyChannelEvent`).
- **Auth bootstrap:** on first sign-in, `ensurePersonalWorkspace`
  (`src/server/auth.ts`) provisions a personal workspace with default
  statuses (`src/lib/default-statuses.ts`) and an "Untitled" project.

