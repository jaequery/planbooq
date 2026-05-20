# Planbooq's Project Context editor: differentiated by conflict surfacing, deliberately not a CMS

The Planbooq editor for Project Context ships with four load-bearing features in v1: AI-suggested inline diffs, cross-artifact linking with autocomplete, **conflict surfacing** (glossary/ADR/AGENTS.md inconsistencies flagged in the gutter), and per-artifact templates. Live multiplayer, provenance-on-hover, and full WYSIWYG are explicitly deferred.

## The moat is conflict surfacing

A markdown editor that knows your glossary, your ADRs, and your AGENTS.md — and flags when they contradict each other or when convention text uses a term not in the glossary — is a thing no other product has. Every term added to CONTEXT.md compounds the value of every later check. This is the single most defensible reason to use Planbooq's editor over `vim`. Start cheap (undefined-term usage in conventions, ADR cross-ref validity) and grow from there.

## Deliberate cuts (the surprising decisions)

- **No second comment system.** Discussion about Project Context belongs in the PR that proposes it. Forking a documents-have-their-own-comments surface fragments the discussion.
- **No folder / hierarchy / tag system.** The four artifacts in [ADR-0002](0002-project-context-artifacts.md) are the structure. Planbooq is not a CMS.
- **No cross-project search.** Project Context is project-scoped per [ADR-0001](0001-project-context-files-are-canonical.md). Cross-project anything is not in scope.
- **No parallel history store.** Git already has history; surface `git log -L` for the open file in a side panel instead of duplicating it into a DB.
- **No rich-text editor that breaks markdown round-trip.** CodeMirror-style live preview is fine; `<div>`-soup WYSIWYG is not. Files must round-trip cleanly because the repo is canonical.

## Deferred (not rejected)

- **Live multiplayer editing.** Realistic edit volume on these four files is low; single-writer-lock with optimistic UI is sufficient for v1. The sync layer (ADR-0001) needs CRDT machinery anyway, so promoting multiplayer to the editor surface is incremental work later, not a re-architecture.
- **Provenance on hover.** Useful but git provides the underlying data; side-panel `git log` is the cheap version. Hover surface is polish, not a v1 bet.

## Consequences

- Conflict surfacing requires the editor to hold a structured model of glossary terms and ADR identifiers in memory; the underlying parser must be tolerant of in-progress edits.
- The "open a PR for every UI edit" norm from [ADR-0004](0004-context-bootstrap-and-refinement-shape.md) means the editor needs an obvious "stage and propose" affordance, not a save button.
- Future "knowledge base" feature creep (comments, folders, cross-project graph) will keep being requested. The ADR is the answer.
