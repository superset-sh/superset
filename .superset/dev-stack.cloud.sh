#!/usr/bin/env bash
# In tmux so the logs stay reachable: `tmux attach -t superset`.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${SUPERSET_LOG_DIR:-/var/log/superset}"

[ -f "$ROOT_DIR/.env" ] || { echo "dev-stack: no .env; the provision hook writes it"; exit 0; }
command -v tmux >/dev/null || { echo "dev-stack: tmux is not installed"; exit 0; }
tmux has-session -t superset 2>/dev/null && { echo "dev-stack: already running"; exit 0; }

mkdir -p "$LOG_DIR"
tmux new-session -d -s superset -n stack -c "$ROOT_DIR" \
  "export NODE_ENV=development; set -a; . '$ROOT_DIR/.env'; set +a; bunx turbo run dev --filter=@superset/api --filter=@superset/web --filter=// 2>&1 | tee '$LOG_DIR/dev-stack.log'"
tmux new-window -t superset -n desktop -c "$ROOT_DIR/apps/desktop" \
  "export DISPLAY=${DISPLAY:-:1} NODE_ENV=development; set -a; . '$ROOT_DIR/.env'; set +a; bun run dev 2>&1 | tee '$LOG_DIR/desktop-dev.log'"
echo "dev-stack: started (tmux attach -t superset)"
