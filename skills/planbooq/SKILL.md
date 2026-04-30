---
name: planbooq
description: Create, update, move, archive, and list Planbooq tickets via the Planbooq REST API. Trigger when the user mentions Planbooq, asks to "make a ticket", "add this to my board", "move ticket X to Y", "what's in my backlog", "list my tickets", or otherwise wants to read or write tickets / projects / statuses / labels / workspaces in Planbooq. Requires PLANBOOQ_API_KEY (and optionally PLANBOOQ_BASE_URL) in the environment.
---

# Planbooq skill

This skill lets Claude manage tickets in a Planbooq instance through its
REST API. The full spec lives at the user's Planbooq install under
`docs/api.md` and `docs/openapi.yaml`. This file is the operational
cheat-sheet — what to do, in what order, with what payload.

## Setup the user must complete once

The skill expects two environment variables:

| Var | Required | Default | Purpose |
|---|---|---|---|
| `PLANBOOQ_API_KEY` | yes | — | Bearer token, format `pbq_live_…`. Mint from Planbooq → Settings → API Keys. Workspace-scoped. |
| `PLANBOOQ_BASE_URL` | no | `http://localhost:3636/api/v1` | Override for prod / staging. |

If `PLANBOOQ_API_KEY` is missing when the skill is invoked, Claude must
stop and tell the user how to set it (one-line export or `~/.zshrc` /
`~/.bashrc` line). Do **not** attempt API calls without it.

The API key is workspace-scoped: every endpoint that takes a
`workspaceId` will only resolve to the workspace the key was minted in.
There is no need to "select" a workspace per call.

## Conventions Claude must follow

- All requests go to `${PLANBOOQ_BASE_URL:-http://localhost:3636/api/v1}`.
- Every request sends `Authorization: Bearer $PLANBOOQ_API_KEY`.
- All bodies are JSON; always send `Content-Type: application/json`.
- Use `curl -sS` (silent, but show errors) and pipe through `jq` when
  available so the tool result is human-readable.
- Response envelope: `{ "ok": true, "data": ... }` or
  `{ "ok": false, "error": "<slug>" }`. Always check `ok` before using
  `data`.
- IDs are `cuid` strings. Never invent them — fetch with a list call
  first.
- When the user describes a target by name ("the Untitled project",
  "the In Progress column"), resolve it to an ID via the appropriate
  list endpoint before the write call. Do not guess.
- Confirm destructive actions (`DELETE /tickets/{id}`, archive of a
  large batch) with the user before firing.

## Resource map

```
GET    /workspaces
GET    /workspaces/{wsId}/projects
GET    /workspaces/{wsId}/statuses
GET    /workspaces/{wsId}/labels
POST   /workspaces/{wsId}/labels             { name, color }
GET    /workspaces/{wsId}/members

GET    /tickets?projectId=...&statusId=...&assigneeId=...
                &includeArchived=false&cursor=...&limit=50
POST   /tickets                              { projectId, statusId, title, description? }
GET    /tickets/{id}
PATCH  /tickets/{id}                         { title?, description?, priority?,
                                               assigneeId?, dueDate?, labelIds? }
DELETE /tickets/{id}
POST   /tickets/{id}/move                    { toStatusId, beforeTicketId?, afterTicketId? }
POST   /tickets/{id}/archive
```

Priority enum: `NO_PRIORITY | URGENT | HIGH | MEDIUM | LOW`.

## Recipes

### Resolve "the kanban board" before any write

When the user says anything like "create a ticket called X" without
naming a project + column, do this first:

```bash
BASE="${PLANBOOQ_BASE_URL:-http://localhost:3636/api/v1}"
AUTH="Authorization: Bearer $PLANBOOQ_API_KEY"

# 1. Find the workspace (API key is workspace-scoped; this returns one).
WS=$(curl -sS -H "$AUTH" "$BASE/workspaces" | jq -r '.data[0].id')

# 2. Fetch projects + statuses in parallel.
curl -sS -H "$AUTH" "$BASE/workspaces/$WS/projects" | jq '.data'
curl -sS -H "$AUTH" "$BASE/workspaces/$WS/statuses" | jq '.data'
```

Pick the project + status that matches the user's intent. If multiple
projects could plausibly fit, ask the user which one — don't guess.

### Create a ticket

```bash
curl -sS -X POST "$BASE/tickets" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg projectId "$PROJECT_ID" \
    --arg statusId "$STATUS_ID" \
    --arg title "$TITLE" \
    --arg description "$DESC" \
    '{projectId:$projectId, statusId:$statusId, title:$title, description:$description}')" \
  | jq
```

Returns the created ticket on `data`. Echo the ticket id and a short
summary back to the user.

### List tickets in a project

```bash
curl -sS -H "$AUTH" \
  "$BASE/tickets?projectId=$PROJECT_ID&limit=100" | jq '.data.items'
```

Paginate with `nextCursor` if it's non-null. Filter client-side if the
user wants something the API doesn't take a query param for.

### Update a ticket

Send only the fields that change. Omit the rest — `PATCH` is partial.

```bash
curl -sS -X PATCH "$BASE/tickets/$TICKET_ID" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"priority":"HIGH","labelIds":["lbl_…","lbl_…"]}' | jq
```

To clear a field: send `null` (works for `description`, `assigneeId`,
`dueDate`).

### Move a ticket between columns

```bash
curl -sS -X POST "$BASE/tickets/$TICKET_ID/move" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "$(jq -n --arg toStatusId "$NEW_STATUS_ID" '{toStatusId:$toStatusId}')" | jq
```

To insert at a specific position, also pass `beforeTicketId` and/or
`afterTicketId` — they must be tickets currently in the **target**
column, same project, not archived. Errors here look like
`invalid_anchor_before` / `invalid_anchor_after`.

Omitting both anchors appends to the bottom of the column.

### Archive vs delete

- **Archive** — preferred. Soft-removes from the board, recoverable
  later (when an unarchive endpoint exists). `POST /tickets/{id}/archive`.
- **Delete** — hard, irreversible. `DELETE /tickets/{id}`. Always
  confirm with the user before calling.

### Labels

List with `GET /workspaces/{wsId}/labels`. Create with `POST` —
`color` must match `^#[0-9a-fA-F]{6}$`. Apply to a ticket via the
`labelIds` array on `PATCH /tickets/{id}` (full replacement, not
partial — pass the complete desired set).

## Error handling

Common error slugs and what they mean:

| Slug | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid `PLANBOOQ_API_KEY` |
| `forbidden` | 403 | Key doesn't grant access to that workspace |
| `ticket_not_found` | 404 | Bad `ticketId` or already deleted |
| `invalid_project` / `invalid_status` | 404 | Bad ID or cross-workspace ID |
| `invalid_assignee` / `invalid_label` | 400 | User/label doesn't belong to this workspace |
| `invalid_anchor_before` / `invalid_anchor_after` | 400 | Anchor isn't in the destination column |
| `label_name_taken` | 400 | Duplicate label name in workspace |
| `validation_error` | 400 | Body shape wrong — re-check against the spec |
| `rate_limited` | 429 | Back off (`Retry-After` header) |

On any non-`ok` response, surface the error slug to the user and
suggest the fix — don't retry blindly.

## Workflow examples

**"Add a ticket to investigate the slow login"**
1. List workspaces → workspace id.
2. List projects → ask user which project, or pick the only one.
3. List statuses → pick `backlog` (or whatever the lowest-position
   status is).
4. `POST /tickets` with title, no description (or a one-line one).
5. Echo: "Created `tkt_…` in 'Project X' / 'Backlog'."

**"Move the slow-login ticket to In Progress"**
1. List tickets in that project, find by title match → ticket id.
2. List statuses → find one named or keyed `in_progress` / `building`.
3. `POST /tickets/{id}/move` with the new status id.

**"What's in my backlog?"**
1. List statuses, find the backlog one.
2. List tickets filtered by `statusId=…&limit=100`.
3. Render a compact table: title · priority · assignee · age.

## What this skill does NOT do

- **Variants** — not yet implemented in the API. If the user asks to
  spawn or pick variants, tell them the endpoint is reserved
  (`/tickets/{id}/variants`, `/variants/{id}/pick`) but not live yet.
- **Realtime** — for live updates, the user should subscribe to the
  Ably channel `workspace:{workspaceId}` directly via
  `/api/ably/token`. This skill is the write surface, not the
  read-stream.
- **API-key minting** — keys are issued from the Planbooq UI, not the
  API. Don't try to mint one programmatically.
