# Workers refine Project Context as part of the ticket PR

When a Worker has insights worth promoting into Project Context, it edits the four canonical artifacts (`CONTEXT.md`, `docs/adr/*.md`, `AGENTS.md`, `docs/learnings.md`) directly as additional commits on the ticket branch, prefixed `context:`. The reviewer sees the proposed context diff in the same PR as the code diff. Merging the PR ships code and knowledge atomically.

## Why

The whole product is built around one review surface — glance at a ticket, ship it. Forking a second approval flow for context updates would dilute that surface and gate knowledge updates behind a separate ritual that, in practice, nobody performs. In-PR edits reuse the existing mechanic verbatim and keep code/context atomically linked so a code change cannot land without the glossary term or convention it depends on.

## Worker rules (enforced via AGENTS.md template)

- Use the `context:` commit prefix for any change to a Project Context artifact, separate from code commits.
- ADRs may only be authored in `proposed` status by Workers; promotion to `accepted` is a human act.
- `docs/learnings.md` is append-only. Workers must never rewrite prior entries; Planbooq's diff view warns on edits to existing lines in that file.
- Do not edit `.planbooq/codebase-snapshot.md` — it is regenerated at worktree creation and never committed.

## Reviewer surface (net-new UI in Planbooq)

When a ticket lands in `review`, the ticket card surfaces `+N context changes` alongside the code change summary. The merge UI offers a **partial merge** toggle: ship code only, ship context only, or ship both. Implemented by rebasing `context:`-prefixed commits in or out at merge time. This is the only piece of new review UI required; everything else is existing PR review.

## Rejected alternatives

- **Separate proposals (`.planbooq/proposals/*.md` or DB rows).** Forks the review surface, doubles approval workflows, breaks atomicity.
- **Periodic batched "learnings digest" PRs.** Decouples learnings from the work that produced them, losing grounding and provenance.
- **Auto-AI pass on the PR proposing extra learnings the Worker missed.** Tempting but generates low-signal noise and review fatigue. Defer until there is evidence Workers under-capture; revisit once human-curated learnings volume is real.

## Consequences

- Context-only work (e.g., a glossary cleanup with no code) flows through the same ticket lane and PR — no special path.
- The merge UI needs commit-prefix awareness; existing GitHub merge buttons are not sufficient for the partial-merge toggle.
- Provenance is free: `git log -- CONTEXT.md` shows the ticket and commit that introduced every term.
