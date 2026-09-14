#!/bin/bash
# The internal environment's setup hook: what a Superset engineer's box has
# beyond the image. Runs once as the sandbox user, with sudo, in the golden
# after the boot runner has checked the monorepo out under /workspace; the
# environment row stores it as its `setup` override, and a fork inherits the
# result. Its `start` counterpart is superset-dev-stack, written below.
set -uo pipefail

log() { printf '[internal-setup] %s\n' "$1"; }

# The sandbox API runs commands with no USER in their env; bash under set -u
# exits 127 on the first reference.
ME="$(id -un)"
CONFIG_REPO="${SUPERSET_INTERNAL_CONFIG_REPO:-https://github.com/saddlepaddle/config.git}"
CONFIG_DIR="$HOME/code/config"
# The release runs this in the primary checkout; the box's start hook runs
# there too, so the dev-stack scripts below take the checkout as their cwd.
WORKSPACE="$(pwd)"

export DEBIAN_FRONTEND=noninteractive
sudo -E apt-get update -qq
# The image carries the toolchain; these are the internal team's shell tools.
sudo -E apt-get install -y -qq --no-install-recommends zsh fzf silversearcher-ag neovim >/dev/null
log "shell tooling installed"
# neonctl: a workspace branches the database for itself on its first start,
# the same way .superset/setup.sh does on a laptop.
sudo npm install -g neonctl@2 >/dev/null 2>&1 && log "neonctl $(neonctl --version 2>/dev/null) installed" || { log "neonctl install failed"; exit 1; }

# The managed environment reaches the start hook as process env. The repo's
# dev scripts read ../../.env (dotenv), so the start hook writes what it was
# started with to /workspace/.env once. Never runs in the golden: the golden
# has no DATABASE_URL, so the file only ever exists inside a fork.
sudo tee /usr/local/bin/superset-materialize-env >/dev/null <<'MATERIALIZE'
#!/usr/bin/env bash
set -u
out="${1:-$PWD/.env}"
[ -f "$out" ] && exit 0
[ -n "${DATABASE_URL:-}" ] || exit 0
tmp="$(mktemp)"
while IFS= read -r -d '' entry; do
  key="${entry%%=*}"; value="${entry#*=}"
  case "$key" in
    SUPERSET_*|HOST_SERVICE_*|VERCEL_*|IS_SANDBOX|PATH|HOME|PWD|OLDPWD|SHLVL|_|DISPLAY|TERM|SHELL|HOSTNAME|LANG|LC_*|NODE_ENV|PORT|TMUX*|USER|LOGNAME|MAIL|DEBIAN_FRONTEND) continue ;;
  esac
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  if [[ "$value" == *$'\n'* ]]; then
    # A multi-line value (a PEM key) goes double-quoted with its newlines as
    # the two characters backslash-n, which dotenv turns back into newlines.
    escaped="${value//\\/\\\\}"; escaped="${escaped//\"/\\\"}"
    escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
    escaped="${escaped//$'\n'/\\n}"
    printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
  elif [[ "$value" != *"'"* ]]; then
    printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  else
    escaped="${value//\\/\\\\}"; escaped="${escaped//\"/\\\"}"
    escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
    printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
  fi
done < <(env -0)
install -m 600 "$tmp" "$out"; rm -f "$tmp"
MATERIALIZE
sudo chmod 755 /usr/local/bin/superset-materialize-env

# First start of a workspace: branch the Neon project for it, point .env at
# the branch, seed the dev account. Mirrors .superset/setup.sh with the
# workspace id as the branch name, since cloud workspaces share a display
# name. Idempotent through the stamp in the state directory; release probes
# skip it so a pipeline run never leaves a branch behind.
sudo tee /usr/local/bin/superset-workspace-db >/dev/null <<'WORKSPACEDB'
#!/usr/bin/env bash
set -u
ENV_FILE="${1:-$PWD/.env}"
STAMP="/var/lib/superset/db-branch"
[ -f "$ENV_FILE" ] || exit 0
[ -f "$STAMP" ] && exit 0
[ "${SUPERSET_RELEASE_PROBE:-}" = "1" ] && exit 0
set -a; . "$ENV_FILE"; set +a
if [ -z "${NEON_API_KEY:-}" ] || [ -z "${NEON_PROJECT_ID:-}" ] || [ -z "${SUPERSET_SANDBOX_WORKSPACE_ID:-}" ]; then
  echo "workspace-db: NEON_API_KEY, NEON_PROJECT_ID or SUPERSET_SANDBOX_WORKSPACE_ID missing; keeping the environment's DATABASE_URL"
  exit 0
fi
name="cloud-${SUPERSET_SANDBOX_WORKSPACE_ID%%-*}"
export NEON_API_KEY
existing="$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json 2>/dev/null | jq -r --arg n "$name" '.[] | select(.name == $n) | .id // empty')"
if [ -n "$existing" ]; then
  branch="$existing"
else
  created="$(neonctl branches create --project-id "$NEON_PROJECT_ID" --name "$name" --output json)" || { echo "workspace-db: branch create failed"; exit 1; }
  branch="$(printf '%s' "$created" | jq -r '.branch.id // .id // empty')"
fi
[ -n "$branch" ] || { echo "workspace-db: no branch id"; exit 1; }
direct="$(neonctl connection-string "$branch" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner)" || exit 1
pooled="$(neonctl connection-string "$branch" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner --pooled)" || exit 1
tmp="$(mktemp)"
grep -vE '^(DATABASE_URL|DATABASE_URL_UNPOOLED)=' "$ENV_FILE" > "$tmp"
printf "DATABASE_URL='%s'\nDATABASE_URL_UNPOOLED='%s'\n" "$pooled" "$direct" >> "$tmp"
install -m 600 "$tmp" "$ENV_FILE"; rm -f "$tmp"
echo "workspace-db: branch $name ($branch)"
( cd "$(dirname "$ENV_FILE")" && set -a && . "$ENV_FILE" && set +a && NODE_ENV=development bun run db:seed-dev ) || { echo "workspace-db: db:seed-dev failed"; exit 1; }
printf '%s %s\n' "$name" "$branch" > "$STAMP"
WORKSPACEDB
sudo chmod 755 /usr/local/bin/superset-workspace-db

# The environment's start hook. With a .env in place it brings the dev stack
# up on the display: api, web and the Electron desktop, the same tasks
# `bun dev` runs, in tmux so the logs are reachable from any terminal
# (`tmux attach -t superset`).
sudo tee /usr/local/bin/superset-dev-stack >/dev/null <<'DEVSTACK'
#!/usr/bin/env bash
# Runs in the checkout: the box's start hook has the hooks repository as cwd.
ws="$PWD"
superset-materialize-env "$ws/.env"
superset-workspace-db "$ws/.env" > /var/log/superset/workspace-db.log 2>&1
if [ -f "$ws/.env" ] && command -v tmux >/dev/null; then
  tmux has-session -t superset 2>/dev/null || {
    tmux new-session -d -s superset -n stack -c "$ws" \
      "export NODE_ENV=development; set -a; . '$ws/.env'; set +a; bunx turbo run dev --filter=@superset/api --filter=@superset/web --filter=// 2>&1 | tee /var/log/superset/dev-stack.log"
    tmux new-window -t superset -n desktop -c "$ws/apps/desktop" \
      "export DISPLAY=${DISPLAY:-:1} NODE_ENV=development; set -a; . '$ws/.env'; set +a; bun run dev 2>&1 | tee /var/log/superset/desktop-dev.log"
  }
fi
DEVSTACK
sudo chmod 755 /usr/local/bin/superset-dev-stack
log "dev stack scripts installed"

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    "" --unattended >/dev/null 2>&1
  log "oh-my-zsh installed"
fi

if [ -d "$CONFIG_DIR/.git" ]; then
  git -C "$CONFIG_DIR" pull --ff-only >/dev/null 2>&1 && log "config repo updated"
else
  mkdir -p "$(dirname "$CONFIG_DIR")"
  git clone --depth 1 "$CONFIG_REPO" "$CONFIG_DIR" >/dev/null 2>&1 &&
    log "config repo cloned"
fi

ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"
for plugin in zsh-autosuggestions zsh-syntax-highlighting; do
  if [ ! -d "$ZSH_CUSTOM/plugins/$plugin" ]; then
    git clone --depth 1 "https://github.com/zsh-users/$plugin" \
      "$ZSH_CUSTOM/plugins/$plugin" >/dev/null 2>&1 && log "$plugin installed"
  fi
done

if [ -d "$CONFIG_DIR/zsh/themes" ]; then
  mkdir -p "$ZSH_CUSTOM/themes"
  cp "$CONFIG_DIR"/zsh/themes/*.zsh-theme "$ZSH_CUSTOM/themes/" 2>/dev/null &&
    log "themes installed from config repo"
fi

if ! grep -qs "code/config/zsh/config.zsh" "$HOME/.zshrc" 2>/dev/null; then
  cat >> "$HOME/.zshrc" <<'ZRC'
export ZSH="$HOME/.oh-my-zsh"
[ -f "$HOME/code/config/zsh/config.zsh" ] && source "$HOME/code/config/zsh/config.zsh"
ZRC
  log ".zshrc wired to config repo"
fi

if command -v zsh >/dev/null && [ "$(getent passwd "$ME" | cut -d: -f7)" != "$(command -v zsh)" ]; then
  sudo chsh -s "$(command -v zsh)" "$ME"
  log "login shell set to zsh"
fi

if [ -d "$WORKSPACE/.git" ] && [ ! -d "$WORKSPACE/node_modules" ]; then
  log "installing dependencies (several minutes)"
  if (cd "$WORKSPACE" && bun install --frozen-lockfile >/tmp/bun-install.log 2>&1); then
    rm -rf "$HOME/.cache/electron"
    log "dependencies installed"
  else
    log "bun install failed:"
    tail -n 30 /tmp/bun-install.log
    exit 1
  fi
fi

log "done"
