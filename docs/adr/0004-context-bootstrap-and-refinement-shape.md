# Project Context bootstraps once via AI; refines only via Worker tickets

When a user first connects a repository, Planbooq runs a single AI extraction pass over a curated input set and proposes initial Project Context as a pull request the user reviews, edits, and accepts. From that point on, Project Context is refined exclusively through the in-PR mechanism described in [ADR-0003](0003-workers-refine-context-in-pr.md): Workers propose updates as part of real ticket work. **Planbooq does not run a continuous background synthesis process.**

## Bootstrap pass

- **Inputs (curated, not the whole repo):** `README`, top-level `docs/`, any existing instruction files (`CLAUDE.md`, `AGENT.md` / `AGENTS.md`, `.cursorrules`, `.cursor/rules/*`), `package.json` and lockfile (for stack signal only), `prisma/schema.prisma` or equivalent, the top two levels of the file tree. Source code, lockfile internals, and `node_modules` are skipped.
- **Outputs:** Proposed `CONTEXT.md`, `AGENTS.md`, and starter ADRs in `proposed` status surfaced as a PR. Initial `docs/learnings.md` is empty by design — learnings must be grounded in real Worker tickets.
- **The activation moment:** when the user has multiple disagreeing instruction files (the common case), bootstrap detects the conflict, surfaces the points of disagreement in the wizard, asks the user to pick the truth, and consolidates into AGENTS.md with projection shims (e.g., `CLAUDE.md` → AGENTS.md symlink).
- **Re-bootstrap** is a button, not a background process. Users can re-run after major refactors. Never automatic.

## Why no background synthesis

Continuous background AI proposals compete with Worker-driven proposals, generate constant low-signal noise, create review fatigue, and decouple context updates from the work that grounds them. Worker-grounded refinement has provenance — every proposal points at the ticket and Worker that produced it. That signal-to-noise advantage is large enough to forgo the convenience of background synthesis.

If user demand for background synthesis emerges later, revisit this — but the bar is "Workers are demonstrably under-capturing," not "it would be nice."

## Planbooq never commits to the user's repo without a PR

Even on first-run bootstrap. Even for tiny edits made in Planbooq's UI. Every write to the canonical files goes through a pull request the user can review, amend, or reject. This is a permanent constraint, not a default. It is load-bearing for the BYOK and portability posture: a tool that silently commits to your repo is a tool that *owns* your repo, and Planbooq does not.

The one exception is the disposable `.planbooq/codebase-snapshot.md` written into the worktree at ticket start — that file is never committed at all (gitignored), so this norm doesn't apply.

## Consequences

- The bootstrap PR is the user's first impression of the product. The wizard's UX is high-leverage and worth disproportionate design effort.
- Tiny in-UI edits (a one-word glossary fix) still open a PR. To keep this from feeling heavy, Planbooq batches multiple small edits within a short window into a single `chore(context): batch` PR per session.
- Pricing for the bootstrap AI pass under BYOK is unresolved and tracked separately as a `proposed` ADR.
