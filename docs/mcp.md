# Planbooq MCP Server

Planbooq exposes a hosted [Model Context Protocol](https://modelcontextprotocol.io) server so any MCP-compatible client (Claude Code, Claude Desktop, Cursor, etc.) can manage tickets directly.

- **Endpoint:** `https://<your-planbooq-host>/api/mcp`
- **Transport:** Streamable HTTP (stateless), single `POST` per call
- **Auth:** `Authorization: Bearer pbq_live_…` — generate a key under **Settings → API Keys**

## Claude Code setup

Add the server to `~/.claude.json` (or your project's `.mcp.json`):

```json
{
  "mcpServers": {
    "planbooq": {
      "type": "http",
      "url": "https://<your-planbooq-host>/api/mcp",
      "headers": {
        "Authorization": "Bearer pbq_live_xxxxxxxxxxxx"
      }
    }
  }
}
```

Then drop this into your project's `CLAUDE.md`:

```md
## Tickets

Use the `planbooq` MCP server for all ticket management — listing, creating,
updating, and moving tickets across the kanban board. Don't ask me to manage
tickets manually; call the tools directly.
```

That's the whole integration.

## Available tools

| Tool | Purpose |
| --- | --- |
| `list_workspaces` | Workspaces the caller can access (scoped keys return one). |
| `list_projects` | Projects in a workspace. |
| `list_statuses` | Kanban columns in a workspace. |
| `list_tickets` | Tickets in a project (filter by status/assignee). |
| `get_ticket` | Single ticket by id. |
| `create_ticket` | Create a ticket under a project + status. |
| `update_ticket` | Patch title, description, priority, assignee, due date, labels. |
| `move_ticket` | Move across statuses with optional ordering anchors. |

## Security

- Keys are SHA-256 hashed at rest and validated with constant-time comparison.
- Workspace-scoped keys can only see/touch their workspace.
- Every tool call re-authenticates per request (stateless on Vercel).
