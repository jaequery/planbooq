# Planbooq documentation

This directory holds Planbooq's durable, version-controlled documentation. Tool-state (CLI wrappers, attachments, ephemeral snapshots) lives in `.planbooq/` instead and is intentionally not documentation.

## Project Context (the four canonical artifacts)

The living, shared knowledge of this project. Every Worker reads these before acting; refinements ride PRs back into shared state. See [ADR-0001](adr/0001-project-context-files-are-canonical.md) and [ADR-0002](adr/0002-project-context-artifacts.md).

- [`../CONTEXT.md`](../CONTEXT.md) — project glossary.
- [`adr/`](adr/) — architecture decision records.
- [`../AGENTS.md`](../AGENTS.md) — coding conventions for AI agents (open standard; `CLAUDE.md` is a symlink).
- [`learnings.md`](learnings.md) — append-only stream of surprising durable facts surfaced by Workers.

## API & workflow reference

- [`api.md`](api.md) — REST API v0 reference (Bearer-token surface used by Claude skills and external automations).
- [`openapi.yaml`](openapi.yaml) — OpenAPI spec mirroring `api.md`.
- [`default-workflow.md`](default-workflow.md) — the default ticket lifecycle steps Planbooq dispatches to Workers.

## Integration runbooks

- [`github-webhook.md`](github-webhook.md) — wiring GitHub webhooks for CI / PR status flow-back.
- [`inngest-prod.md`](inngest-prod.md) — Inngest production setup.
- [`mcp.md`](mcp.md) — Model Context Protocol integration notes.

## Conventions for new docs

- New ADRs use a date-prefixed filename: `YYYY-MM-DD-slug.md` (extend with `-HHmm` if same-day collisions are likely). See [`adr/2026-05-20-adr-files-use-date-prefix.md`](adr/2026-05-20-adr-files-use-date-prefix.md). Existing counter-prefixed ADRs (`0001-`...`0008-`) keep their names.
- New ADRs ship in `proposed` status from Workers; humans promote to `accepted`.
- `learnings.md` is append-only. Never rewrite prior entries.
