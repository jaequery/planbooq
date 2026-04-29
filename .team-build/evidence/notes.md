# Visual evidence — Prisma 7 adapter patch

`01-seed-user-signin.png` — `dev@planbooq.local` (note the `D` avatar in the top-right) successfully signs in via magic link and lands on `/p/untitled`. Before this patch, the same flow failed with `?error=Configuration` because `@auth/prisma-adapter` v2.11.2 calls `p.session.delete({ where: { sessionToken } })`, which throws `P2025` on Prisma 7 when the session row doesn't exist. The patch wraps `deleteSession` (and `deleteUser`) in a try/catch that swallows P2025, matching the same pattern the adapter already uses for `useVerificationToken`.
