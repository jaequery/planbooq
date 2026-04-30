# Planbooq Claude skill

A Claude Code skill that talks to the Planbooq REST API to create and
manage tickets through natural-language prompts.

## Install

Copy this directory into your Claude skills folder:

```bash
# User-scoped (recommended — works in any repo)
mkdir -p ~/.claude/skills
cp -r skills/planbooq ~/.claude/skills/

# OR project-scoped (only active in this repo)
mkdir -p .claude/skills
cp -r skills/planbooq .claude/skills/
```

Restart Claude Code (or run `/skills` to verify it's loaded).

## Configure

Mint an API key in the Planbooq UI (Settings → API Keys) and export:

```bash
export PLANBOOQ_API_KEY="pbq_live_…"
# Optional — defaults to local dev:
export PLANBOOQ_BASE_URL="https://planbooq.example.com/api/v1"
```

Drop these into `~/.zshrc` / `~/.bashrc` to persist.

## Use

Just talk to Claude:

- "Add a ticket to the Untitled board: 'fix the slow login'"
- "Move ticket tkt_xyz to In Progress"
- "What's in my backlog?"
- "Archive every ticket in Done that's older than 30 days"
- "Tag tkt_xyz with the 'bug' label and set it to HIGH priority"

The skill auto-resolves project / status / label names to IDs via list
endpoints before any write. It will ask if a name is ambiguous.

## See also

- `docs/api.md` — REST spec
- `docs/openapi.yaml` — machine-readable spec
- `SKILL.md` — what Claude actually loads
