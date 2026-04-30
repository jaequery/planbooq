# Planbooq REST API (Draft v0)

> **Status:** Spec only. Not yet implemented. Source of truth for the
> upcoming `src/app/api/v1/**` route handlers and the companion Claude
> skill that wraps them.

## Why this exists

Tickets in Planbooq today are managed through Next.js **server actions**
(`src/actions/ticket.ts`) authenticated via NextAuth session cookies.
Server actions are unreachable from outside the browser — Claude skills,
CLIs, and external automations need an HTTP surface with a non-cookie
auth model.

This document specifies that surface. The REST handlers will be a thin
HTTP shim over the same Prisma logic the server actions already use, so
behavior stays consistent across both entry points.

## Conventions

- **Base path:** `/api/v1`
- **Versioning:** Path-based (`/v1`). Breaking changes bump the major.
- **Content type:** `application/json` for both request and response.
- **IDs:** `cuid` strings (matches Prisma schema).
- **Timestamps:** ISO 8601 UTC.
- **Response envelope:** mirrors the server-action `ServerActionResult`:
  ```json
  { "ok": true,  "data": { ... } }
  { "ok": false, "error": "ticket_not_found" }
  ```
  HTTP status follows the envelope: `2xx` only when `ok: true`.
- **Error codes** are stable string slugs (`unauthorized`, `forbidden`,
  `invalid_status`, `ticket_not_found`, `invalid_assignee`,
  `invalid_label`, `label_name_taken`, `invalid_anchor_before`,
  `invalid_anchor_after`, `validation_error`, …) — not free-form prose.
- **Pagination:** cursor-based (`?cursor=<id>&limit=<n>`, max 100).
- **Idempotency:** `POST` endpoints accept an optional
  `Idempotency-Key` header; replays within 24h return the original
  response.

## Authentication

Two mechanisms, in order of precedence:

1. **API key** — `Authorization: Bearer pbq_live_<...>`
   - Issued per workspace member from the settings UI.
   - Scoped to a single workspace; never crosses workspace boundaries.
   - Inherits the issuing member's role (`OWNER` / `MEMBER`).
   - Stored hashed (argon2id); only the prefix `pbq_live_…` is shown
     after creation.
2. **Session cookie** — the existing NextAuth session, for first-party
   browser calls. Treated identically once resolved to a `userId`.

All endpoints below require auth unless explicitly marked public. A
missing/invalid token returns `401 unauthorized`. A valid token whose
member is not in the target workspace returns `403 forbidden`.

## Rate limits

- **Default:** 600 req / min / API key, 60 write req / min / API key.
- **Burst:** token bucket, 60-second refill window.
- Exceeded → `429` with `Retry-After` header and
  `{ "ok": false, "error": "rate_limited" }`.

## Resources

```
Workspace ── Project ── Ticket ── Variant (planned)
       └─── Status
       └─── Label
       └─── Member
```

### Ticket object

```json
{
  "id": "ckxx…",
  "workspaceId": "ckxx…",
  "projectId": "ckxx…",
  "statusId": "ckxx…",
  "title": "Add login flow",
  "description": "…",
  "priority": "NO_PRIORITY",
  "assignee": {
    "id": "ckxx…",
    "name": "Jae",
    "email": "jae@example.com",
    "image": null
  },
  "labels": [{ "id": "ckxx…", "name": "bug", "color": "#ff0000" }],
  "dueDate": "2026-05-15T00:00:00.000Z",
  "position": 4,
  "createdById": "ckxx…",
  "createdAt": "2026-04-29T12:00:00.000Z",
  "updatedAt": "2026-04-29T12:00:00.000Z",
  "archivedAt": null
}
```

`priority` enum: `NO_PRIORITY | URGENT | HIGH | MEDIUM | LOW`.

---

## Endpoints

### Workspaces

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/workspaces` | List workspaces the caller is a member of |
| `GET` | `/v1/workspaces/{workspaceId}` | Fetch one workspace |
| `GET` | `/v1/workspaces/{workspaceId}/members` | List members → `{ user: {...} }[]` |
| `GET` | `/v1/workspaces/{workspaceId}/labels` | List labels |
| `POST` | `/v1/workspaces/{workspaceId}/labels` | Create label `{ name, color }` |

`color` must match `^#[0-9a-fA-F]{6}$`. Duplicate `name` →
`label_name_taken`.

### Projects

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/workspaces/{workspaceId}/projects` | List projects |
| `GET` | `/v1/projects/{projectId}` | Fetch project |
| `GET` | `/v1/projects/{projectId}/statuses` | Ordered list of board columns |

### Tickets

All ticket endpoints map 1:1 to `src/actions/ticket.ts`.

#### List

```
GET /v1/projects/{projectId}/tickets
  ?statusId=…           # optional filter
  &assigneeId=…         # optional filter
  &includeArchived=false
  &cursor=…
  &limit=50
```

Returns `{ ok: true, data: { items: Ticket[], nextCursor: string | null } }`.

#### Get one

```
GET /v1/tickets/{ticketId}
```

#### Create

```
POST /v1/tickets
{
  "projectId":   "ckxx…",
  "statusId":    "ckxx…",
  "title":       "string (1..200)",
  "description": "string (0..5000, optional)"
}
→ 201 Created, body = Ticket
```

Errors: `invalid_project`, `invalid_status`.

#### Update

```
PATCH /v1/tickets/{ticketId}
{
  "title?":       "string (1..200)",
  "description?": "string|null",
  "priority?":    "NO_PRIORITY|URGENT|HIGH|MEDIUM|LOW",
  "assigneeId?":  "string|null",
  "dueDate?":     "ISO8601|null",
  "labelIds?":    ["ckxx…"]
}
→ 200 OK, body = Ticket (with relations)
```

Only fields present in the body are touched. `description: ""` is
normalized to `null` (matches server action behavior). Errors:
`ticket_not_found`, `invalid_assignee`, `invalid_label`.

#### Move (reorder / change column)

```
POST /v1/tickets/{ticketId}/move
{
  "toStatusId":      "ckxx…",
  "beforeTicketId?": "ckxx…|null",
  "afterTicketId?":  "ckxx…|null"
}
→ 200 OK
{ "ticketId": "…", "toStatusId": "…", "position": 4.5 }
```

Anchors must be in the same `(workspaceId, projectId, toStatusId)` and
not archived; otherwise `invalid_anchor_before` /
`invalid_anchor_after`. Omitting both anchors appends to the bottom of
the target column.

#### Archive

```
POST /v1/tickets/{ticketId}/archive
→ 200 OK { "ticketId": "…" }
```

Idempotent: archiving an already-archived ticket returns
`ticket_not_found` (matches current server-action semantics — revisit
when adding `unarchive`).

#### Delete

```
DELETE /v1/tickets/{ticketId}
→ 200 OK
{ "id": "…", "workspaceId": "…", "projectId": "…", "statusId": "…" }
```

Hard delete — the ticket and its variants (when implemented) are
removed permanently. Prefer `archive` for soft-removal flows.

---

## Realtime (informational)

Every write above also publishes an Ably event on
`workspace:{workspaceId}` (see `src/server/ably.ts`). Events:

- `ticket.created`
- `ticket.updated`
- `ticket.moved`
- `ticket.archived`
- `ticket.deleted`

Skills that need live updates can mint an Ably token via the existing
`/api/ably/token` endpoint and subscribe directly. The REST API is the
write surface; Ably is the read-stream for state changes.

---

## Variants — planned (not in v0)

Per `CLAUDE.md`, ticket variants are first-class. The schema does not
yet model them; this section reserves the API shape so the eventual
implementation lands without breaking changes to v1.

Anticipated routes:

```
GET    /v1/tickets/{ticketId}/variants
POST   /v1/tickets/{ticketId}/variants          # spawn N workers
GET    /v1/variants/{variantId}
PATCH  /v1/variants/{variantId}                 # status, notes
POST   /v1/variants/{variantId}/pick            # mark as winner
DELETE /v1/variants/{variantId}
```

Anticipated `Variant` fields: `id`, `ticketId`, `index`, `branch`,
`worktreePath`, `previewUrl`, `screenshotUrls[]`, `diffStat`,
`status` (`pending|running|ready|failed|picked|discarded`),
`workerKind` (`claude-code|cursor|…`), `pickedAt`, `pickedById`,
`createdAt`. Lock the schema in a follow-up phase before exposing.

---

## OpenAPI

A machine-readable `openapi.yaml` derived from this document lives at
`docs/openapi.yaml` (to be generated alongside the v0 implementation).
The Claude skill (`skills/planbooq-tickets/SKILL.md`) will consume it
to build typed tools.

## Open questions for review

1. **API key scope** — workspace-scoped (current proposal) vs
   user-scoped with workspace selector per request? Workspace-scoped
   is safer; user-scoped is fewer keys to manage.
2. **`unarchive`** — needed for v0 or fine to defer? Current server
   actions don't expose it.
3. **Bulk move** — kanban DnD often moves multiple cards (multi-select).
   Add `POST /v1/tickets/bulk-move` in v0 or defer?
4. **Webhooks** — Ably covers in-app realtime, but external automations
   (Slack, Discord) typically want HTTP webhooks. v0 or v1.1?
5. **Variant model** — lock the schema now (so v0 ships with variants)
   or punt to v1.1? Locking now means a real design pass on
   worker orchestration before any HTTP surface ships.
