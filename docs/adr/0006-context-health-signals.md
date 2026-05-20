# Context health is surfaced as four pull-based, in-context signals — not an inbox

Planbooq surfaces Project Context drift through four signals computed on-demand when the user opens a project:

1. **Term usage delta** — glossary term's reference count drops sharply over time → flag possibly-obsolete.
2. **ADR contradiction by code change** — a PR touches code keyword-mapped to an ADR without touching the ADR itself → flag for review.
3. **Ticket-without-context-touch streak** — N consecutive tickets ship against the same module with no edits to CONTEXT.md / AGENTS.md / ADRs for that area → flag as likely missing context.
4. **Glossary coverage gap** — a noun appears in ≥3 PRs across ≥2 tickets but is absent from CONTEXT.md → auto-propose adding it.

## UX: in-context chip, no separate inbox

Signals appear as a single chip in the project header showing `N health signals`. Clicking opens a flyout listing them. **No "Context Health" sidebar surface.** Reasons: a permanent inbox makes Planbooq feel like nag-ware; signals belong embedded where work happens (gutter marks on contradicted ADRs, glossary chip in CONTEXT.md). The kanban stays the primary surface.

## Pull-based, not push

Signals refresh when the user opens the project, not on every PR merge via Inngest. Pull is fine for v1; the user pays the compute cost only when they care to look, and there's no background nag pipeline to maintain. Revisit only if real-time signals matter (no evidence yet that they do).

## Auto-action policy

- **Signal 4 (glossary coverage)** auto-creates a `proposed` glossary entry. Low-risk and almost always wanted.
- **All other signals** require a human click to act. Auto-creating proposed ADRs from contradiction signals would be presumptuous — these need human framing.

## Deferred signals (explicit list)

- **Convention violation rate** — requires AGENTS.md rules to be machine-checkable. Comes after a structured-rules format.
- **Stale learning detection** — only earns its keep once the learnings file has volume.
- **Conflicting Worker behaviors across PRs** — interesting research, not v1.

## Why this and not a background AI nag

[ADR-0004](0004-context-bootstrap-and-refinement-shape.md) rejected continuous AI synthesis on signal-to-noise grounds. The four signals here are deterministic, evidence-based, and grounded in data Planbooq already has (PRs, file paths, term frequencies). No new AI pipeline; no review fatigue.

## Consequences

- Each signal needs a deterministic, fast-on-pull computation. Anything that can't be computed in <2 seconds on project open is rejected.
- The `N health signals` chip is the only permanent UI affordance — the gutter marks and inline flags are conditional. This caps the visual cost.
- "Why don't we have a context-health inbox / dashboard / Slack notifications?" is the FAQ this ADR exists to answer.
