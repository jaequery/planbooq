# Visual evidence — multi-projects

Captured against `pnpm dev` on `:3636` after a real magic-link sign-in (fresh user `fresh+today@planbooq.local` whose Personal workspace and default `Untitled` project were auto-provisioned by the Auth.js bootstrap).

- `01-sidebar.png` — Authenticated `/p/untitled` view of the new layout. Left rail: workspace label "Personal", "Projects" section, the active "Untitled" row (indigo dot + soft-fill highlight), "+ New project" CTA at the bottom. Top bar: "Personal / Untitled" breadcrumb with the project's color dot, theme toggle, user avatar (F). Right side of top bar: "Realtime off" pill (Ably fail-soft, no API key). The 6 default status columns render with their colored dots and empty states.
- `02-new-project-dialog.png` — "+ New project" opens the shadcn dialog with the full form: name, auto-derived slug with `/p/<slug>` hint, 8 preset color swatches (indigo selected by default), optional description, optional repo URL placeholder, and the Tech stack textarea with the AI-prompt helper text ("Used by AI agents when generating tickets. Describe your stack, conventions, libraries to use/avoid, code style. Example: 'Next.js 16 + Postgres + Prisma. Use shadcn for all UI. Strict TypeScript. No CSS frameworks other than Tailwind v4.'"). Cancel + Create project buttons.

The legacy PR#1 evidence files in this directory (`01-signin-redirect.png`, `02-board-authed.png`, `03-signin-empty.png`) are inherited from main and preserved; this PR's new evidence is `01-sidebar.png` and `02-new-project-dialog.png`.

## Known follow-up — not introduced by this PR

`@auth/prisma-adapter` calls `prisma.session.delete({ where: { sessionToken } })` in its `deleteSession` implementation. Prisma 7 throws `P2025` when no record matches, where Prisma 5 returned null. This breaks subsequent sign-ins for users with prior sessions (re-login flow). Fresh users sign in cleanly, so this PR was validated end-to-end with a fresh email. Fix path is `pnpm patch @auth/prisma-adapter` to swap `delete` → `deleteMany` (or upgrade once the adapter ships Prisma-7-aware semantics).
