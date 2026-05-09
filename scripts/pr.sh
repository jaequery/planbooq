#!/usr/bin/env bash
# Test a PR in a dedicated review worktree without disturbing the main dev server.
#
# Usage:
#   scripts/pr.sh <pr-number|branch>     fetch + check out into review worktree, restart review dev server
#   scripts/pr.sh stop                   stop the review dev server
#   scripts/pr.sh logs                   tail the review dev server logs
#   scripts/pr.sh status                 show what the review worktree is on
#
# Conventions:
#   - Review worktree lives at ../planbooq-review
#   - Review dev server runs on PORT=3637
#   - Logs at /tmp/planbooq-review.log, pidfile at /tmp/planbooq-review.pid

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PARENT_DIR="$(dirname "$REPO_ROOT")"
WORKTREE_DIR="$PARENT_DIR/planbooq-review"
PORT=3637
LOG_FILE="/tmp/planbooq-review.log"
PID_FILE="/tmp/planbooq-review.pid"

stop_server() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "→ stopping review dev server (pid $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Belt-and-suspenders: kill anything else on the port
  lsof -ti tcp:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
}

start_server() {
  stop_server
  echo "→ starting review dev server on http://localhost:$PORT (logs: $LOG_FILE)"
  cd "$WORKTREE_DIR"
  PORT=$PORT nohup pnpm dev >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  disown
}

cmd="${1:-}"
case "$cmd" in
  ""|"-h"|"--help")
    sed -n '2,12p' "$0"
    exit 0
    ;;
  stop)
    stop_server
    echo "✓ stopped"
    exit 0
    ;;
  logs)
    exec tail -f "$LOG_FILE"
    ;;
  status)
    if [[ -d "$WORKTREE_DIR/.git" || -f "$WORKTREE_DIR/.git" ]]; then
      (cd "$WORKTREE_DIR" && git log -1 --oneline && git status --short)
    else
      echo "no review worktree at $WORKTREE_DIR"
    fi
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "dev server: running (pid $(cat "$PID_FILE")) on :$PORT"
    else
      echo "dev server: not running"
    fi
    exit 0
    ;;
esac

target="$cmd"

# Resolve PR number → branch via gh, otherwise treat input as a branch name.
if [[ "$target" =~ ^[0-9]+$ ]]; then
  if ! command -v gh >/dev/null; then
    echo "gh CLI required to resolve PR numbers" >&2
    exit 1
  fi
  echo "→ resolving PR #$target"
  branch="$(gh pr view "$target" --json headRefName -q .headRefName)"
  remote_repo="$(gh pr view "$target" --json headRepositoryOwner,headRepository -q '.headRepositoryOwner.login + "/" + .headRepository.name')"
else
  branch="$target"
  remote_repo=""
fi

echo "→ fetching $branch"
git -C "$REPO_ROOT" fetch origin "$branch:refs/remotes/origin/$branch" 2>/dev/null || \
  git -C "$REPO_ROOT" fetch origin "$branch" || true

# Ensure local tracking branch exists / is up to date.
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
  : # branch already exists locally; we'll reset it inside the worktree
else
  git -C "$REPO_ROOT" branch --track "$branch" "origin/$branch" 2>/dev/null || true
fi

# Stop server before touching the worktree (avoids file lock weirdness).
stop_server

# Create or reuse the review worktree.
if [[ ! -d "$WORKTREE_DIR" ]]; then
  echo "→ creating review worktree at $WORKTREE_DIR"
  git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" "$branch"
else
  echo "→ reusing review worktree, switching to $branch"
  cd "$WORKTREE_DIR"
  # If the desired branch is checked out elsewhere, that's a problem — but it
  # shouldn't be, since we just stopped our own server and the user's main
  # worktree is on a different branch.
  git checkout -B "$branch" "origin/$branch"
  git reset --hard "origin/$branch"
fi

cd "$WORKTREE_DIR"

# Sync deps + Prisma client (cheap when nothing changed).
echo "→ pnpm install"
pnpm install --prefer-offline
echo "→ prisma generate"
pnpm db:generate >/dev/null

start_server

cat <<EOF

✓ review worktree ready
  branch:    $branch
  path:      $WORKTREE_DIR
  url:       http://localhost:$PORT
  logs:      scripts/pr.sh logs
  stop:      scripts/pr.sh stop
EOF
