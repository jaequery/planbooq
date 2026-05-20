# Project Context lives in the repo; Planbooq's DB is a mirror

Planbooq's Project Context (glossary, ADRs, conventions, codebase map) is stored as Markdown files in each project's git repository — `CONTEXT.md`, `docs/adr/*.md`, `CONVENTIONS.md`, and `.planbooq/codebase-map.md`. Planbooq's database mirrors these files to power multiplayer editing, AI-suggested diffs, and visualization, but the files are the source of truth. Edits made in Planbooq's UI commit back to the repo.

## Why

Workers run inside a per-ticket worktree and need to read Project Context with zero plumbing — any AI coding tool (Claude Code, Cursor, Codex, future ones) just sees the files. This keeps Planbooq's BYOK posture honest: your knowledge is yours, versioned with your code, and survives leaving Planbooq. Context changes ride the same PR review surface as code changes, so reviewers ship knowledge updates and code together instead of letting docs drift.

## Considered options

- **DB-canonical.** Rich UI and real-time editing wins, but every Worker would need an MCP/API surface to fetch context, lock-in is severe, and code merges that should update context routinely won't because the docs aren't in the PR.
- **Files-only, no mirror.** Pure but gives up multiplayer editing, structured queries, and history visualization. Planbooq would have nothing to add over `vim CONTEXT.md`.
- **Hybrid, files canonical (chosen).** Files for Workers and portability; DB mirror for the editing surface.

## Consequences

- A sync layer is required: file-watcher → DB ingest, and DB-edit → debounced commit. Live multiplayer editing needs a CRDT/OT layer in the DB tier since git is too slow to be the live coordination substrate. Bounded but real work.
- Schema-on-read for the DB mirror: it must tolerate any markdown the repo contains (including hand edits made outside Planbooq).
- Conflict resolution policy needed when Planbooq UI and external git pushes touch the same file simultaneously. Default: last-writer-wins at the file level, with a visible conflict marker in the UI.
