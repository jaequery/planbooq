# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Planbooq is a SaaS kanban platform for vibe coding in the age of parallel AI code generation. Its core thesis: **the bottleneck has moved from writing code to deciding on AI-generated output**. Sequential prompt-and-iterate is broken. Planbooq fixes it by spawning N AI variants per ticket in parallel, surfacing each as a live preview URL + screenshots, and letting the user pick the winner hot-or-not style instead of re-prompting.

It is positioned to replace the current vibe coding stack (Lovable + Cursor + Linear) with a single surface optimized for fast review/decide/redirect rather than for writing or tracking.

See `README.md` for the full pitch and the default workflow (`backlog` → `planning` → `building` → `review` → `shipping` → `completed`).

## Core Product Concepts

When reasoning about features or architecture, keep these concepts central:

- **Ticket = parallel job.** A ticket is not a unit of work assigned to one worker. It is a prompt that fans out to N isolated AI workers, each producing a candidate result.
- **Variants are first-class.** Every ticket has a 1-to-many relationship with variants. Each variant has its own branch, worktree, preview URL, screenshots, and diff.
- **Pick, don't prompt.** The primary user action is choosing among finished variants. Re-prompting exists but is the fallback, not the default.
- **Remix is v2 but inevitable.** Users will want to combine elements across variants ("hero from #2, footer from #3"). Design data models so this is additive, not a rewrite.
- **BYOK is the unit-economics answer.** Variant fan-out multiplies AI compute cost. Bring-your-own-key is the default monetization strategy; hosted compute is a premium tier.
- **Taste learning compounds.** Which variants get picked is the most valuable proprietary signal. Capture it from day one.

## Tech Stack (planned)

- **Framework:** Next.js
- **Database:** Postgres (local dev on port `5435`)
- **Dev server port:** `3035`

Stack choices beyond this are not yet locked in.

## Repository State

Greenfield. Only `README.md` and `CLAUDE.md` exist. No source code, build system, package manager, or test framework is in place yet.

When establishing the stack, update this file with:
- Build, lint, test, and dev-server commands (including how to run a single test).
- The high-level architecture once it spans more than one file — in particular: how parallel variant execution works (worktree orchestration, isolated preview environments, screenshot capture), how the ticket-and-variants data model is shaped, how the real-time kanban stays in sync, and how the Claude Code integration fits into the variant lifecycle. That set is the core of the product and won't be obvious from reading any single file.
