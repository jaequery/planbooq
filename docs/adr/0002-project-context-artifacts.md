# Project Context is exactly four artifacts; AGENTS.md is the canonical conventions file

Project Context is composed of four files in each project repository, no more, no less:

1. `CONTEXT.md` — the project glossary (human-edited).
2. `docs/adr/*.md` — decisions, including `proposed`-status entries for open questions (human-edited, append-only).
3. `AGENTS.md` — coding conventions, rules, and anti-patterns (human-edited, single source of truth).
4. `.planbooq/learnings.md` — surprising durable facts surfaced by Workers (Worker proposes at PR time; reviewer-gated on merge).

## Why this set

These four cover the failure modes that Workers actually hit at scale: hallucinated synonyms (glossary), "fixing" deliberate choices (decisions), inconsistent code patterns (conventions), and rediscovering the same gotcha every ticket (learnings). Everything else either belongs on the ticket itself, exists in code/config already, or rots faster than it pays off.

## Why AGENTS.md, not a Planbooq-specific file

AGENTS.md is the emerging cross-vendor standard read by Codex, Cursor background agents, Aider, Sourcegraph Amp, and recent Claude Code. Inventing a Planbooq-specific filename would fight the standard, add a fifth file to the proliferation problem we are trying to solve, and break the BYOK-portability posture. Planbooq adopts the standard and stays on it.

For tools that do not yet honor AGENTS.md natively, Planbooq generates thin projection shims (e.g., `CLAUDE.md`, `.cursorrules`) as mirrors. Humans only ever edit AGENTS.md.

## Deliberately rejected: a maintained codebase map

A narrative `ARCHITECTURE.md` or `codebase-map.md` rots within weeks and actively misleads Workers more than it helps. Where Workers need "where things live" hints, Planbooq generates a fresh `.planbooq/codebase-snapshot.md` at worktree-creation time (imports graph, entry points, routing table), drops it into the worktree as a *runtime convenience*, and never commits it. Disposable, always fresh.

## Consequences

- The existing stale `AGENT.md` (singular) in this repo must be renamed to `AGENTS.md` and rewritten to reflect actual product reality.
- Planbooq's UI surfaces exactly these four artifacts as editable; everything else in `docs/` is just documentation, not Project Context.
- "Open questions" are captured as `proposed`-status ADRs, not in a separate file.
