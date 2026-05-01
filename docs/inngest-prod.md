# Inngest in production

The runtime code (`src/server/inngest/client.ts`, `src/app/api/inngest/route.ts`,
`src/server/inngest/functions.ts`) is correct. If Inngest isn't working on a
deployed environment (Vercel), it is almost always one of three configuration
gaps below.

## 1. Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for the
Production environment (and Preview if you want previews to publish events):

| Variable                | Value                                                                 |
|-------------------------|-----------------------------------------------------------------------|
| `INNGEST_EVENT_KEY`     | From Inngest Cloud → your env → **Event Keys**.                       |
| `INNGEST_SIGNING_KEY`   | From Inngest Cloud → your env → **Signing Key**.                      |
| `INNGEST_REQUIRED`      | `true` — fails the build if the keys above are missing.               |

Do **not** set `INNGEST_DEV` in production. It is for `pnpm inngest` local dev
only.

`INNGEST_REQUIRED=true` is enforced by `src/env.ts` and turns silent
misconfiguration into a hard build failure — set it on every real deploy.

## 2. Register the endpoint with Inngest Cloud

Setting env vars is not enough. Inngest Cloud needs to know the endpoint
exists so it can sync function definitions and start invoking them.

1. Deploy the app so `https://<your-host>/api/inngest` is publicly reachable.
2. Open Inngest Cloud → **Apps** → **Sync new app**.
3. Paste `https://<your-host>/api/inngest` and confirm.
4. Inngest issues a `PUT` to that URL using `INNGEST_SIGNING_KEY` to register
   each function in `inngestFunctions` (currently `ticket-created`).

If the sync fails, the most common cause is a signing-key mismatch between
Vercel and Inngest Cloud — generate a fresh key in Inngest, paste it into
Vercel, redeploy, then re-sync.

You can also trigger a sync from the deploy itself by hitting the endpoint
once with `curl https://<your-host>/api/inngest` and looking for the
`mode: "cloud"` response — confirms cloud mode is active and the keys are
loaded.

## 3. Verify

After both of the above:

1. Trigger an event the app sends — for example, create a ticket. The server
   action calls `inngest.send({ name: "ticket/created", ... })`.
2. In Inngest Cloud → **Runs**, the event should appear within a few seconds
   and the `ticket-created` function should run with a successful step.

If events appear but functions don't run, the registration step (2) was
skipped or the signing key is wrong. If events never appear, the publish
side is broken — re-check `INNGEST_EVENT_KEY` in Vercel.

## Local development (unchanged)

Local dev keeps using the Inngest dev shim:

```bash
pnpm dev        # Next on :3636
pnpm inngest    # dev runner against http://localhost:3636/api/inngest
```

`.env.local` should have `INNGEST_DEV=1` and the keys can be left empty.
