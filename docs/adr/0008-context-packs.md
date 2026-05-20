# Context Packs — portable, propose-time bundles of Project Context

A **Context Pack** is a portable bundle of Project Context fragments — glossary entries, ADR drafts, AGENTS.md sections, optionally seed learnings — that can be applied to a project to propose those fragments into its four canonical artifacts. Applying a pack always opens a PR; packs never inject at runtime ([ADR-0007](0007-project-context-is-project-scoped-at-runtime.md)).

## Sources

- **Personal packs** — saved by a user across their own projects ("my React/TS conventions").
- **Workspace packs** — shared across members of a workspace ("our team's logging and error rules").
- **Public / marketplace packs** — discoverable through a future Planbooq pack directory; may be free or paid.

The architecture must not preclude paid distribution. A pack reference includes a source URI; the resolver for that URI can later be gated on entitlement without changing the pack format or the apply flow.

## Pack format

A pack is itself a git repository containing:

- `pack.yaml` — name, version, description, source URI, applies-to filters (e.g. "Node ≥ 20"), pricing metadata stub.
- `glossary/` — markdown fragments to merge into `CONTEXT.md`.
- `adrs/` — ADR drafts to add under `docs/adr/` in `proposed` status.
- `agents/` — markdown fragments to merge into `AGENTS.md`.
- `README.md` — human description, screenshots, what to expect.

Making the pack a git repo gives versioning, forking, and improvement for free. A pack reference is `{uri}@{version}`.

## Apply semantics

When the user applies a pack to a project, Planbooq runs a 3-way merge wizard:

1. Show pack fragments alongside the project's current artifacts; mark conflicts inline.
2. User resolves conflicts (keep mine / take pack / merge both / edit).
3. Planbooq opens a single `context: apply pack {name}@{version}` PR with the resolved content. Reviewer ships per [ADR-0003](0003-workers-refine-context-in-pr.md).

After merge, each affected file carries a managed comment block at the top noting "Includes content from pack `name@version`" so subsequent pack updates can detect and diff against prior application.

## Updates

When a referenced pack releases a new version, Planbooq surfaces a context-health signal (via [ADR-0006](0006-context-health-signals.md)) and offers to open a diff PR proposing the upgrade. Auto-apply is rejected for the same reason auto-ADR is rejected: human framing matters.

## Consequences

- The pack registry / marketplace UI is not v1, but the pack format and apply flow are. v1 supports applying a pack from any git URL.
- Forking a pack is `git clone` then publish — same model as npm scoped packages.
- A bad pack can still produce a noisy PR; the user's review is the safety net. This is by design.
- Paid pack entitlement enforcement is deferred infrastructure; the architecture exposes a single point (the URI resolver) to add it later.
