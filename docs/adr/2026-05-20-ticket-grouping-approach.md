# Group related tickets via a parent-with-checklist, not a hierarchy

**Status:** proposed

A request that fans out into multiple tickets should be modeled as **one origin ticket carrying a structured checklist**, where individual items can be *promoted* into their own tickets on demand. The promotion creates a typed `spawned-from` link back to the origin. The kanban board stays flat — every ticket is still one Worker, one branch, one PR — and "what spawned what" is recoverable from the link, not from a tree of nested tickets.

## Why this question came up

A user described the failure mode in the ticket: they fired a single request at Planbooq, ended up with multiple related tickets, and lost the thread. Nothing on the board said "these five came from that one ask," nothing said "this one waits on that one," and the only available grouping primitive was an ad-hoc shared label.

## Current state

`prisma/schema.prisma` has no parent/child FK on `Ticket`, no self-relation, no `TicketLink` table, no checklist column, no `blockedBy` field. The grouping primitives that exist today are:

- `Project` — coarse, one repo per project.
- `Status` — kanban column, expresses lifecycle stage not relationship.
- `Label` (many-to-many) — flat tags; can be co-opted but carries no semantics.
- `TicketContextDoc` / `TicketSkill` / `TicketAgentProfile` — association to other entities, not other tickets.

Net: zero ticket-to-ticket primitive. The user's pain is the absence of a feature, not a bug in an existing one.

## Three approaches considered

| Dimension              | (1) Sub-ticket hierarchy            | (2) Checklist that spawns tickets         | (3) Enhanced linking / dependencies      |
| ---------------------- | ----------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Schema cost            | Self-FK on `Ticket` + recursion     | New `TicketChecklistItem` model           | New `TicketLink` join (type, from, to)   |
| Kanban UX              | Nested rows; two classes of citizen | Flat board; checklist lives in the ticket | Flat board; edges as sidecar info        |
| Throughput alignment   | Parent often blocks until children  | Spawn-on-demand; no implicit block        | Soft links — no implicit block           |
| Dependency expression  | Implicit (parent waits on children) | None unless layered on top                | Explicit, typed (`blocks`, `relates-to`) |
| Reporting              | "% children done" rollup            | "Items vs spawned" two-state view         | Graph traversal — richer, heavier        |
| Migration risk         | High (touches every list query)     | Medium (purely additive model)            | Low (additive join table)                |

(1) **Sub-tickets** is the Jira shape. It buries throughput inside hierarchy and pressures the user to wait on the parent before the children can ship — directly against Planbooq's parallel-Worker thesis. Rejected as the primary surface.

(2) **Checklist that spawns tickets** keeps one ticket = one Worker = one PR. The origin ticket holds the *plan*; each item is initially inline text the user can check off without ceremony, and any item can be promoted into a real ticket when it deserves its own Worker. The promoted ticket records where it came from. This matches the user's stated pain ("I lost the thread of what came from where") because the origin ticket *is* the thread.

(3) **Typed linking** solves visibility (a sidebar showing "related tickets, blocks, blocked-by") but does not solve *origin*. By itself it requires the user to manually wire up edges after the fact, which is exactly the bookkeeping they were trying to avoid.

## Recommendation

Adopt **(2) as the primary surface**, plus a **thin slice of (3)** to record the `spawned-from` edge created when a checklist item is promoted. Concretely:

- Add a structured checklist to the origin ticket (items have text + checked state + optional `spawnedTicketId`). Inline by default — promoting an item to a ticket is an explicit user act.
- Add a single `TicketLink` row type for `spawned-from`. Future link types (`blocks`, `relates-to`) can be added later without changing the join shape — but they are explicitly **out of scope for the implementation of this ADR** and should land via a follow-up decision once the checklist UX has shipped and the user is asking for them.
- The board stays flat. The spawned-from edge is surfaced as a small affordance on each ticket ("from PLAN-XXXX"), not as nested rows.

## Considered alternatives (and why they were not chosen)

- **Sub-tickets (option 1).** Rejected above — fights parallel throughput.
- **Pure linking, no checklist (option 3 alone).** Rejected — leaves the user to manually wire edges, which is the bookkeeping they reported as the problem.
- **Use the existing `Label` table to mark origin.** Considered. Rejected — labels are workspace-scoped name strings with no semantics; encoding origin in a label name is a stringly-typed hack that will rot the moment ticket IDs change format or the user wants to query "everything spawned from X."
- **Persist checklist items only as Markdown in `Ticket.description` until promoted.** A genuine option for v0. Cheaper (no new model). Loses queryability ("show me unfinished items across all tickets" is awkward against Markdown). Leaving the *storage shape* — Markdown vs structured rows — as the one substantive open question for the implementation ticket.

## Open question for the reviewer

Should checklist items live as their own `TicketChecklistItem` rows from day one, or as inline Markdown in `Ticket.description` until promoted? Rows give queryability and clean realtime updates; Markdown is cheaper and ships faster. Either is compatible with this ADR's primary recommendation — flagging it because the answer determines the implementation ticket's scope.

## Consequences

- A future ticket adds the `TicketChecklistItem` model (or Markdown convention), the `TicketLink` table with the `spawned-from` type, the promote-to-ticket action, and the small "from PLAN-XXXX" affordance on the kanban card. None of that ships in this PR.
- `CONTEXT.md` will need a glossary entry for **Origin Ticket** and **Spawned Ticket** once this ADR is `accepted`. Coining the terms before acceptance is premature; the implementation ticket handles the glossary update as a `context:` commit alongside the schema change.
- This ADR does not contradict ADR-0001 or ADR-0007 — those govern the four Project Context artifacts (knowledge), not operational ticket data, which already lives in the DB.
