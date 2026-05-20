# Planbooq

The cockpit for vibe coders running many AI-coding tickets in parallel. The kanban surface that lets one human keep dozens of agents shipping at once.

## Language

**Ticket**:
A unit of work that runs through a single AI agent session in its own branch and worktree. The atomic object of Planbooq.
_Avoid_: Task, issue, story, card

**Worker**:
The AI agent session bound to a ticket. One ticket, one worker.
_Avoid_: Agent (overloaded — see below), assistant, bot

**Worktree**:
The isolated working copy of the repository attached to a ticket's branch. Created when the ticket enters `building`, destroyed after merge.
_Avoid_: Workspace (means something else here), checkout

**Workspace**:
The top-level tenant container. One per user (personal) or one per team. Contains projects, members, statuses.
_Avoid_: Org, account, team

**Project**:
A board inside a workspace. Maps roughly 1:1 to a code repository. Has its own kanban view at `/p/<slug>`.
_Avoid_: Repo, board

**Throughput**:
The number of useful changes shipped per unit time. The thing Planbooq optimises for.
_Avoid_: Velocity (overloaded with sprint velocity), speed

**Project Context**:
The living, shared knowledge of a project, composed of exactly four artifacts in the repository: `CONTEXT.md` (glossary), `docs/adr/*.md` (decisions), `AGENTS.md` (conventions), and `.planbooq/learnings.md` (curated learnings). Every Worker inherits it on ticket start; refinements ride the PR back into shared state. The mechanism that lets parallel Workers stay coherent instead of drifting. See [ADR-0002](docs/adr/0002-project-context-artifacts.md).
_Avoid_: Docs, knowledge base, memory, rules

**AGENTS.md**:
The cross-vendor coding-conventions file (open standard at agents.md). In Planbooq this is the single source of truth for "how to code in this repo," edited once and projected as needed to tool-specific shims (`CLAUDE.md`, `.cursorrules`).
_Avoid_: CLAUDE.md, .cursorrules, CONVENTIONS.md, rules file (those are projections or rejected names)

**Learnings**:
Surprising, durable facts that emerged while building a ticket and that future Workers need to know — e.g., "provider X rate-limits at 5/sec," "Prisma 7 trips on Y." Workers propose them on the PR; the human reviewer ships them by merging. Lives in `.planbooq/learnings.md`. Append-only.
_Avoid_: Lessons, notes, postmortem, retro

**Context Commit**:
A commit on a ticket branch that modifies one of the four Project Context artifacts. Prefixed `context:` in the commit message so the reviewer (and Planbooq's merge UI) can distinguish it from code commits and ship code/context independently. See [ADR-0003](docs/adr/0003-workers-refine-context-in-pr.md).
_Avoid_: Docs commit, knowledge commit

**Context Pack**:
A portable, versioned bundle of Project Context fragments (glossary entries, ADR drafts, AGENTS.md sections) shipped as a git repository. Applied to a project at propose time via a PR — never injected at runtime. Personal, workspace-shared, public, or future paid. See [ADR-0008](docs/adr/0008-context-packs.md).
_Avoid_: Template (overloaded), starter kit, preset, recipe

## Flagged ambiguities

**"Agent"** is overloaded between (a) the AI session running a ticket — we call that a **Worker** — and (b) generic third-party tools (Claude Code, Cursor) that act as workers. When unclear, prefer **Worker** for the ticket-bound session.

**"Context"** is overloaded with the LLM's prompt context window. In Planbooq, **Project Context** is the durable, shared artifact; the LLM's per-turn context window is just a transient slice of it.

## Example dialogue

> Dev: When a Worker picks up a Ticket, does it see the Project Context automatically?
> PM: Yes — every Worker inherits the current Project Context the moment its Worktree is created. If it learns something durable while building, that learning is proposed back into Project Context as part of the PR, and the human reviewer ships the knowledge update at the same time they ship the code.
> Dev: So Project Context is versioned alongside the code?
> PM: That's the whole point — your knowledge can't drift from your codebase if they merge together.
