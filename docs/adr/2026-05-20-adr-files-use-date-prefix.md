# New ADRs use a date prefix, not an incrementing counter

**Status:** proposed

New ADR filenames use the form `YYYY-MM-DD-slug.md` (e.g., `2026-05-20-learnings-live-under-docs.md`). When same-day collisions are likely, extend with a UTC time component: `YYYY-MM-DD-HHmm-slug.md`. The existing 4-digit counter scheme (`0001-...md` through `0008-...md`) stays untouched — renaming the historical files would break every cross-reference and ADR-link in the codebase, and the cost is greater than the value of uniform formatting.

## Why

Planbooq's whole product thesis is parallel tickets, each in its own worktree, each potentially proposing a `context:` commit that includes a new ADR. Two Workers racing to land an ADR concurrently both pick the next free integer (`0009-`), collide on filename, and the second PR fails to merge or — worse — silently overwrites the first on rebase. A date prefix removes the contested resource. Two same-day ADRs almost certainly cover different topics, so the slug carries the uniqueness. If they truly collide, append `-HHmm`.

The other thing the counter format encodes is *ordering by decision*. Date prefixes preserve that — they sort lexicographically by when the decision was proposed, which is what readers actually want when scanning the directory.

## Considered alternatives

- **Keep the counter, rely on PR-time conflict detection.** Pushes the problem onto humans at merge time, in the exact moment Planbooq is supposed to make frictionless. Rejected.
- **Use a content-hashed filename (`adr-<short-hash>.md`).** Removes collisions but destroys readability and stable links. Rejected.
- **Use Unix epoch.** Maximally collision-free but unreadable. The date is the right level of granularity for an artifact humans read.
- **Renumber historical ADRs to the new format.** Breaks every existing cross-reference (CONTEXT.md, AGENTS.md, README, ADRs that reference each other) for no functional gain. Rejected.

## Consequences

- AGENTS.md is updated to require date-prefixed filenames for new ADRs. Workers follow it on every ticket.
- The `docs/adr/` directory will contain a mix of formats (counter-prefixed legacy + date-prefixed new). That is fine — both sort sensibly, and the directory is small enough that visual scan is not strained.
- Tools that parse ADR filenames (none currently exist in this repo) would need a pattern that accepts both. Documented here so future tooling is aware.
- A future ADR that supersedes one of the legacy `000X-` ADRs links to it by filename as today; no rename needed.
