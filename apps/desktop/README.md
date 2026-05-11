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

## Code-signing & notarization

Signing + notarization are already wired into `forge.config.ts`, gated on the
presence of env vars. If any of these are unset, `make`/`publish` produces
an unsigned `.dmg` that Gatekeeper will block — useful only for local
testing.

To produce a Gatekeeper-clean `.dmg`:

| Env var | Where it comes from |
|---|---|
| `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` — the full string like `"Developer ID Application: Your Name (TEAMID)"` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com → Sign-In and Security → App-Specific Passwords](https://appleid.apple.com/account/manage) |
| `APPLE_TEAM_ID` | Apple Developer Membership Details page |

Plus the icon assets:

1. `.icns` icon at `src/renderer/assets/icon.icns`
2. Tray template png at `src/renderer/assets/tray-icon.png`

## CI / release pipeline

`.github/workflows/desktop-release.yml` builds the `.dmg` on every push to
`main` that touches the desktop / broker / packages tree, plus on `v*` tags
and `workflow_dispatch`. Matrix runs `arm64` + `x64` in parallel on
`macos-latest`.

Repo secrets the workflow expects (all optional — unsigned builds work
without them):

- `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64` — `.p12` cert, base64-encoded
- `APPLE_CERTIFICATE_PASSWORD` — the `.p12` password
- `KEYCHAIN_PASSWORD` — any random string; password for the ephemeral CI keychain

The release ships as a **draft** (see `PublisherGithub.draft: true`). A human
flips it to Published in the GitHub UI when ready, and only then does the
auto-updater pick it up.

## Why this shape (vs. fully native)

The web app already does the hard work. A wrapper costs us almost nothing, ships in days not weeks, and gets us to the parts that *only* a native shell can do — global hotkeys later, deep links now, tray + system notifications, and the local worktree spawner that's the actual reason a desktop app exists for this product.

If/when the renderer needs to diverge from the web app, the structure already supports a custom renderer entry — just point `mainWindow.loadURL` at `MAIN_WINDOW_VITE_DEV_SERVER_URL` (or the packaged renderer) instead of `APP_URL`.
