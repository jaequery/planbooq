# GitHub webhook → auto-complete on merge

Planbooq listens for PR-merge events from GitHub and auto-moves the linked
ticket to its workspace's `Completed` column.

## How the link works

When a Planbooq ticket has a `prUrl` set (manually, or written by the
`/planbooq-team-build` skill after `gh pr create`), the webhook handler
matches incoming `pull_request.closed` + `merged: true` events against
`Ticket.prUrl == payload.pull_request.html_url` and moves the matching
ticket. Unmatched URLs are a silent no-op (204) so the same webhook can be
pointed at multiple repos without noise.

## One secret, all repos

Use a single `GITHUB_WEBHOOK_SECRET` for every repo you wire up. Generate
once and reuse:

```bash
openssl rand -hex 32
```

Set the value in `.env` as `GITHUB_WEBHOOK_SECRET` and paste the same
string into each repo's GitHub webhook settings.

## Configure on GitHub

For every repo that hosts code linked to Planbooq tickets:

1. Go to **Settings → Webhooks → Add webhook**.
2. **Payload URL:** `<your-NEXTAUTH_URL>/api/webhooks/github`
3. **Content type:** `application/json`
4. **Secret:** the `GITHUB_WEBHOOK_SECRET` from your `.env`.
5. **Which events?** *Let me select individual events* → check **Pull requests** only.
6. **Active:** on. Save.

GitHub will send a `ping` event; Planbooq returns 204 for it. Trigger a
real merge to see the column move.

## Local development

Webhooks need a public URL. The simplest path is a tunnel:

```bash
gh webhook forward --repo OWNER/REPO --events=pull_request \
  --url http://localhost:3636/api/webhooks/github \
  --secret "$GITHUB_WEBHOOK_SECRET"
```

(Or use any equivalent — `cloudflared`, `ngrok`, etc.)

## What the handler does

- Verifies `X-Hub-Signature-256` with HMAC-SHA256 against the raw body
  using `crypto.timingSafeEqual`. Bad signature → 401.
- Ignores everything that isn't `pull_request` with `action=closed` and
  `merged=true` → 204.
- Looks up the ticket by exact `prUrl` match. No match → 204.
- Resolves the ticket workspace's `Completed` status (case-insensitive).
  Missing column → warning log + 204.
- If already in `Completed`, no-op.
- Otherwise moves the ticket, sets `position = MAX+1` in the new column,
  and broadcasts a `ticket.moved` Ably event so connected boards refresh
  in real time.

## What it does **not** do

- It does not write a Planbooq comment back to the ticket — Planbooq
  comments require a real `User` author and the GitHub merger may not be
  one. Track this as a follow-up if you want a visible audit trail.
- It does not match against branch names or PR body magic words. The
  link is `Ticket.prUrl` only.
- It does not act on closed-without-merge. Those tickets stay where they
  are.
