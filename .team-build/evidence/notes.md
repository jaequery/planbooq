# Visual evidence — scaffold + kanban skeleton

Captured against `pnpm dev` on `http://localhost:3636` with Postgres on `5656`, Mailpit on `8025`. No `ABLY_API_KEY` set, so the realtime indicator correctly shows "Realtime off" (fail-soft).

- `01-signin-redirect.png` — Unauthenticated visit to `/` redirects to `/signin`. Magic-link flow had previously been completed in this browser session, so the card shows the "Check your inbox" success state above; capture is the cached frame from the prior submit (note the persisted email autofill).
- `02-board-authed.png` — Authenticated `/w/u-cmoj5rm4z0` (auto-provisioned personal workspace from the magic-link sign-in). All six default statuses render with their colored dots — Backlog, Planning, Building, Review, Shipping, Completed (cropped right edge). One ticket "create landing page" was created via the in-app "+ New ticket" dialog and lives in the Building column with relative timestamp. Top bar shows workspace name "Personal", theme toggle, and user avatar dropdown. "Realtime off" pill in the top-right is the fail-soft state for missing Ably key.
- `03-signin-empty.png` — Pristine `/signin` Card with email input + "Send magic link" CTA.

The full magic-link end-to-end flow was exercised: sign-in form → email submitted → Mailpit received the message (visible in tab 1 during capture) → magic link clicked → session established → personal workspace auto-provisioned with the six default statuses → ticket created via the dialog. This validates Auth.js v5 magic-link, the Prisma adapter, the createUser/signIn workspace-bootstrap event, server actions, and optimistic UI in a single human flow.
