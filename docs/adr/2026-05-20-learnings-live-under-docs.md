# `learnings.md` moves from `.planbooq/` to `docs/`

**Status:** proposed
**Supersedes (in part):** [`0002-project-context-artifacts.md`](0002-project-context-artifacts.md) — item 4 of the canonical four-artifact list.

The canonical learnings file is now `docs/learnings.md`. The four-artifact composition of Project Context (glossary, ADRs, conventions, learnings) is unchanged; only the path moves.

## Why

`.planbooq/` had become a mixed-purpose directory:

| Path                              | Category   | Lifetime                          |
| --------------------------------- | ---------- | --------------------------------- |
| `.planbooq/pbq`                   | tool-state | per-session shim, regenerated     |
| `.planbooq/attachments/`          | tool-state | user-uploaded blobs               |
| `.planbooq/codebase-snapshot.md`  | tool-state | gitignored, regenerated per ticket |
| `.planbooq/learnings.md`          | **knowledge** | durable, append-only           |

Three tool-state entries plus one durable-knowledge artifact. The mismatch made `.planbooq/` look like a knowledge folder to newcomers and like a tool folder to operators — both views were half-right and wholly confusing.

Moving learnings under `docs/` aligns the directory boundaries with the *kind* of content:

- **Root** (`README.md`, `CONTEXT.md`, `AGENTS.md`): top-level entry points and conventions.
- **`docs/`**: durable knowledge — ADRs, API spec, integration runbooks, **learnings**.
- **`.planbooq/`**: Planbooq tool-state only. Everything in it is either regenerated, gitignored, or tool-internal. A `.planbooq/` directory should now be safe to delete and have Planbooq recreate, without losing knowledge.

## Considered alternatives

- **Keep at `.planbooq/learnings.md`.** Cheapest option. Rejected because it preserves the category mismatch and forces every future contributor to learn an irregular convention.
- **Move `docs/adr/` into `.planbooq/`.** Symmetric resolution but in the wrong direction — buries ADRs in a dotted directory, fights the de-facto agents.md ecosystem norm that ADRs live in `docs/`, and removes top-level discoverability.
- **Promote `learnings.md` to repo root.** Considered. Rejected because root is already crowded with three entry-point files (`README.md`, `CONTEXT.md`, `AGENTS.md`) and a fourth would dilute that surface.

## Consequences

- One commit `git mv`s the file. No source code references the old path (verified via grep across `src/`); it is purely a doc-and-text move.
- Six markdown files have the old path baked in and are updated in the same `context:` commit: `CONTEXT.md`, `AGENTS.md`, `README.md`, `docs/adr/0002`, `docs/adr/0003`, `docs/adr/0004`.
- No stub or redirect is left at `.planbooq/learnings.md`. Planbooq is in closed alpha and the file is unreferenced outside this repo; commit history + this ADR are sufficient breadcrumbs.
- A new `docs/README.md` navigation hub ships in the same change so the four canonical Project Context artifacts are discoverable from one page.
- Once this ADR is `accepted`, ADR-0002 should be updated in place (or another `proposed` ADR opened) to reflect the new path canonically.
