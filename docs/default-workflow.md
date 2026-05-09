# Default CI Workflow

`.github/workflows/default.yml` is the baseline GitHub Actions workflow for this repo. It runs on every push to a non-`main` branch and on every PR targeting `main`.

## Jobs

### `build`
Runs lint, typecheck, and `next build` against Node 20 with pnpm.

The Next build is invoked directly (`pnpm exec next build`) instead of `pnpm build` so CI does not attempt `prisma migrate deploy` against a database that is not provisioned in the runner. Migrations are deployed by the application's release pipeline, not by CI.

Required env (placeholder values are fine for build-time):
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

### `open-pr`
Runs only after `build` passes, only on `push` events, and only for non-`main` branches. Uses the GitHub CLI to open a draft PR from the pushed branch into `main`. If a PR already exists for that branch, the step is a no-op so re-pushes do not error.

This is the "automatically creates a pull request at the end when applicable" half of the workflow: applicability = build green + branch is not `main` + no PR open yet.

## Triggering manually
The workflow also supports `workflow_dispatch` so you can re-run the build for a branch from the Actions tab without pushing a new commit.

## Concurrency
Runs are grouped per `github.ref` and in-progress runs are cancelled when a newer commit lands on the same ref, so stale builds do not waste minutes.
