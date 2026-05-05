# Planbooq Desktop

Linear-style native shell for Planbooq. Wraps the deployed web app in a polished macOS Electron window with deep links, tray, native notifications, local worktree spawning, and auto-update.

## Architecture

- **Thin wrapper.** The main `BrowserWindow` loads `PLANBOOQ_APP_URL` (defaults to `http://localhost:3636` in dev, `https://app.planbooq.com` in packaged builds). Auth, UI, and routing all live in the Next.js app — the desktop process only adds native polish.
- **Same-origin lock.** Cross-origin navigation opens in the system browser via `shell.openExternal`. Same-origin links stay in-window.
- **Single instance.** Second launches focus the existing window and forward any `planbooq://` deep link.
- **IPC surface (`window.planbooq`)** — see `src/preload.ts`. Renderer code in the wrapped web app can call:
  - `spawnWorktree({ repoPath, branch, prompt })` — runs `git worktree add` + `claude` in a new dir, streams logs.
  - `pickRepoPath()` — directory picker, validates the choice is a git repo.
  - `setAblyToken(token, channel)` — start the desktop's Ably notification bridge.
  - `setUnreadCount(n)` — update tray badge + dock badge.

## Running locally

```bash
# from repo root
pnpm install
pnpm --filter @planbooq/desktop start
```

By default the desktop app expects the Next.js dev server on `http://localhost:3636`. Start it in a second tab with `pnpm dev` from the repo root.

Override the URL:

```bash
PLANBOOQ_APP_URL=https://staging.planbooq.com pnpm --filter @planbooq/desktop start
```

## Building a dmg

```bash
pnpm --filter @planbooq/desktop make
```

Outputs `apps/desktop/out/make/` with arm64 + x64 dmg artifacts (run on each arch or use a CI matrix).

## Publishing (auto-update)

`electron-updater` reads from GitHub Releases via the `electron-forge` `PublisherGithub` config in `forge.config.ts`. Set:

```bash
export GH_TOKEN=...                    # personal access token with repo scope
export GH_REPO_OWNER=jaequery
export GH_REPO_NAME=planbooq
pnpm --filter @planbooq/desktop publish
```

Drafts a release; mark it published when ready and existing installs auto-update on next launch.

## Code-signing & notarization (TODO)

DMGs from `make` are unsigned. For distribution outside dev:

1. Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
2. Add `osxSign` and `osxNotarize` blocks to `packagerConfig` in `forge.config.ts`.
3. Drop a `.icns` icon at `src/renderer/assets/icon.icns` and a tray template png at `src/renderer/assets/tray-icon.png`.

## Why this shape (vs. fully native)

The web app already does the hard work. A wrapper costs us almost nothing, ships in days not weeks, and gets us to the parts that *only* a native shell can do — global hotkeys later, deep links now, tray + system notifications, and the local worktree spawner that's the actual reason a desktop app exists for this product.

If/when the renderer needs to diverge from the web app, the structure already supports a custom renderer entry — just point `mainWindow.loadURL` at `MAIN_WINDOW_VITE_DEV_SERVER_URL` (or the packaged renderer) instead of `APP_URL`.
