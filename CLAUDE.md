# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Planbooq is a SaaS kanban platform for vibe coding in the age of parallel AI code generation. Its core thesis: **the bottleneck has moved from writing code to deciding on AI-generated output**. Sequential prompt-and-iterate is broken. Planbooq fixes it by spawning N AI variants per ticket in parallel, surfacing each as a live preview URL + screenshots, and letting the user pick the winner hot-or-not style instead of re-prompting.

It is positioned to replace the current vibe coding stack (Lovable + Cursor + Linear) with a single surface optimized for fast review/decide/redirect rather than for writing or tracking.

See `README.md` for the full pitch and the default workflow (`backlog` → `todo` → `building` → `review` → `completed`).

## Core Product Concepts

When reasoning about features or architecture, keep these concepts central:

- **Ticket = parallel job.** A ticket is not a unit of work assigned to one worker. It is a prompt that fans out to N isolated AI workers, each producing a candidate result.
- **Variants are first-class.** Every ticket has a 1-to-many relationship with variants. Each variant has its own branch, worktree, preview URL, screenshots, and diff.
- **Pick, don't prompt.** The primary user action is choosing among finished variants. Re-prompting exists but is the fallback, not the default.
- **Remix is v2 but inevitable.** Users will want to combine elements across variants ("hero from #2, footer from #3"). Design data models so this is additive, not a rewrite.
- **BYOK is the unit-economics answer.** Variant fan-out multiplies AI compute cost. Bring-your-own-key is the default monetization strategy; hosted compute is a premium tier.
- **Taste learning compounds.** Which variants get picked is the most valuable proprietary signal. Capture it from day one.

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

## Variants (planned, not implemented)

The README pitches parallel AI variants per ticket; the schema does
not model `Variant` yet. The REST spec reserves the route shape
(`/v1/tickets/{id}/variants`, `/v1/variants/{id}/pick`) so the
eventual data model lands without breaking v1. Worker orchestration
(worktree spawning, preview URLs, screenshot capture, Claude Code
integration) is TBD — design before exposing.
