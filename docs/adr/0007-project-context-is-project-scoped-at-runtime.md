# Project Context is project-scoped at runtime; no workspace or user layering

Project Context applies at the project (repository) level only. Planbooq does not inject workspace-level or user-level rules into a Worker's worktree at runtime. The four canonical artifacts in the repo are the *entire* set of context the Worker sees.

## Why

[ADR-0001](0001-project-context-files-are-canonical.md) says files in the repo are canonical. The moment Planbooq injects rules at runtime that aren't in the repo, that claim becomes a lie: the Worker is acting under rules a reviewer cannot see in the PR, the same repo behaves differently under Planbooq vs. a plain `claude` invocation, and BYOK portability is broken. A PR review must be a complete picture of what shaped the Worker's output. Hidden runtime layers are not allowed.

## How shared/personal rules still get in

Authoring is layered at *propose time* via [ADR-0008](0008-context-packs.md) (Context Packs). A user maintains a personal AGENTS.md template; applying it to a project opens a PR that merges its content into the project's AGENTS.md. After merge, the rules live in the repo like any other line and the reviewer can see them in every future PR. Same principle as `~/.gitconfig` — global config exists, but anything that changes what a teammate sees must be in the repo.

## Consequences

- A user with strong personal conventions will see the same lines repeated across multiple projects' AGENTS.md. That duplication is acceptable; the cure (runtime injection) is worse than the disease.
- Editor preferences, notification settings, and other Planbooq-UI personalisation remain user-scoped because they do not influence Worker behavior.
- "Can I have a global rule that auto-applies everywhere?" — no. The answer is always "apply the pack and merge the PR."
