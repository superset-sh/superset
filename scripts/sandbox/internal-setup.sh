#!/bin/bash
set -uo pipefail

log() { printf '[internal-setup] %s\n' "$1"; }

CONFIG_REPO="${SUPERSET_INTERNAL_CONFIG_REPO:-https://github.com/saddlepaddle/config.git}"
CONFIG_DIR="$HOME/code/config"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# build-essential, python3 and the X11 headers: `bun install` runs the
# desktop's `electron-builder install-app-deps`, which compiles native-keymap
# and friends against Electron. xdotool lets an agent drive the display.
apt-get install -y -qq --no-install-recommends \
  zsh tmux fzf silversearcher-ag neovim xterm xdotool jq \
  build-essential python3 pkg-config libx11-dev libxkbfile-dev >/dev/null
log "shell tooling installed"
# neonctl: a workspace branches the database for itself at first boot (below),
# the same way .superset/setup.sh does on a laptop.
npm install -g neonctl@2 >/dev/null 2>&1 && log "neonctl $(neonctl --version 2>/dev/null) installed" || { log "neonctl install failed"; exit 1; }
# The image has no locale, so the prompt's glyphs print "character not in
# range". C.UTF-8 ships with glibc and needs no locale-gen.
cat > /etc/profile.d/superset-locale.sh <<'LOCALE'
export LANG=C.UTF-8 LC_ALL=C.UTF-8
LOCALE
printf 'export LANG=C.UTF-8 LC_ALL=C.UTF-8\n' >> "$HOME/.zshenv"
log "locale set to C.UTF-8"
# The desktop pane shows :1. An empty openbox root is a black rectangle that
# reads as broken, so give the display a terminal from the first frame.
mkdir -p "$HOME/.config/openbox"
# Environment secrets arrive as process env. The repo's dev scripts read
# ../../.env (dotenv), and tmux does not pass the server's environment through
# reliably, so a workspace writes what it was provisioned with to
# /workspace/.env once, at first boot. Never runs in the golden (no
# DATABASE_URL there), so the file only ever exists inside a fork.
cat > /usr/local/bin/superset-materialize-env <<'MATERIALIZE'
#!/usr/bin/env bash
set -u
out="${1:-/workspace/.env}"
[ -f "$out" ] && exit 0
[ -n "${DATABASE_URL:-}" ] || exit 0
tmp="$(mktemp)"
while IFS= read -r -d '' entry; do
  key="${entry%%=*}"; value="${entry#*=}"
  case "$key" in
    SUPERSET_*|HOST_SERVICE_*|BLAXEL_*|PATH|HOME|PWD|OLDPWD|SHLVL|_|DISPLAY|TERM|SHELL|HOSTNAME|LANG|LC_*|NODE_ENV|PORT|TMUX*|USER|LOGNAME|MAIL|DEBIAN_FRONTEND) continue ;;
  esac
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  case "$value" in *$'\n'*) continue ;; esac
  if [[ "$value" != *"'"* ]]; then
    printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  else
    # Double quotes are the fallback for values with a single quote in them.
    # The autostart sources this file with sh, so backslash, quote, dollar and
    # backtick are escaped the way sh unescapes them (round-trip verified).
    # dotenv keeps those backslashes, so a value with both a single quote and
    # one of these characters reads differently from a shell that skipped the
    # autostart; sh sets the process env first, and dotenv never overrides it.
    escaped="${value//\\/\\\\}"; escaped="${escaped//\"/\\\"}"
    escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
    printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
  fi
done < <(env -0)
install -m 600 "$tmp" "$out"; rm -f "$tmp"
MATERIALIZE
chmod 755 /usr/local/bin/superset-materialize-env
# First boot of a workspace: branch the Neon project for it, point .env at the
# branch, seed the dev account. Mirrors .superset/setup.sh (neonctl branches
# create from the project's default branch, connection strings by role) with
# the workspace id as the branch name, since cloud workspaces share a display
# name. Idempotent through the stamp file; release probes skip it so a
# pipeline run never leaves a branch behind.
cat > /usr/local/bin/superset-workspace-db <<'WORKSPACEDB'
#!/usr/bin/env bash
set -u
ENV_FILE="${1:-/workspace/.env}"
# Outside the checkout: a stamp inside it shows up as an unstaged change.
STAMP="/data/.superset-db-branch"
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
( cd /workspace && set -a && . "$ENV_FILE" && set +a && NODE_ENV=development bun run db:seed-dev ) || { echo "workspace-db: db:seed-dev failed"; exit 1; }
printf '%s %s\n' "$name" "$branch" > "$STAMP"
WORKSPACEDB
chmod 755 /usr/local/bin/superset-workspace-db
cat > "$HOME/.config/openbox/autostart" <<'AUTOSTART'
xterm -geometry 140x40+40+40 -fa Monospace -fs 11 -bg black -fg white &
superset-materialize-env /workspace/.env
superset-workspace-db /workspace/.env > /tmp/superset-workspace-db.log 2>&1
# With a .env in place bring the whole dev stack up on this display: api, web
# and the Electron desktop, the same tasks `bun dev` runs. The desktop runs in
# its own window with `--noSandbox`: Electron refuses to start as root
# without it, and the sandbox runs everything as root. The image's
# NODE_ENV=production must not leak into dev, and tmux keeps the logs
# reachable from any terminal (`tmux attach -t superset`).
if [ -f /workspace/.env ] && command -v tmux >/dev/null; then
  tmux has-session -t superset 2>/dev/null || {
    tmux new-session -d -s superset -n stack -c /workspace \
      'export NODE_ENV=development; set -a; . /workspace/.env; set +a; bunx turbo run dev --filter=@superset/api --filter=@superset/web --filter=// 2>&1 | tee /tmp/superset-dev.log'
    tmux new-window -t superset -n desktop -c /workspace/apps/desktop \
      'export DISPLAY=:1 NODE_ENV=development; set -a; . /workspace/.env; set +a; bun run dev -- --noSandbox 2>&1 | tee /tmp/superset-desktop.log'
  }
fi
AUTOSTART
log "openbox autostart set (xterm)"

apt-get install -y -qq --no-install-recommends \
  libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
  libatspi2.0-0 libsecret-1-0 libgbm1 libasound2 libdrm2 libxkbcommon0 \
  >/dev/null 2>&1 && log "electron runtime libraries installed" \
  || log "electron libraries failed (desktop dev will not start)"
# apt's ldconfig trigger is deferred in this container; refresh the loader
# cache now so Electron (and the release checks) find the libraries.
ldconfig

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

if command -v zsh >/dev/null && [ "$(getent passwd root | cut -d: -f7)" != "$(command -v zsh)" ]; then
  chsh -s "$(command -v zsh)" root
  log "login shell set to zsh"
fi

WORKSPACE="${SUPERSET_SANDBOX_WORKSPACE_PATH:-/workspace}"
MONOREPO="${SUPERSET_INTERNAL_MONOREPO_URL:-https://github.com/superset-sh/superset.git}"
# The image already creates $WORKSPACE, and git clone refuses a directory that
# exists, so warm it in place. A fetch of main is what start.sh does on boot
# too, which is why a fork of this sandbox takes the fast path.
if [ ! -d "$WORKSPACE/.git" ]; then
  mkdir -p "$WORKSPACE"
  if git -C "$WORKSPACE" init -q &&
    git -C "$WORKSPACE" remote add origin "$MONOREPO" &&
    git -C "$WORKSPACE" fetch -q --depth 1 origin main &&
    git -C "$WORKSPACE" checkout -q -B main FETCH_HEAD; then
    log "monorepo warmed at $WORKSPACE"
  else
    log "monorepo warm failed"
    exit 1
  fi
fi

if [ -d "$WORKSPACE/.git" ] && [ ! -d "$WORKSPACE/node_modules" ]; then
  if command -v bun >/dev/null; then
    log "installing dependencies (several minutes)"
    if (cd "$WORKSPACE" && bun install --frozen-lockfile >/tmp/bun-install.log 2>&1); then
      rm -rf "$HOME/.cache/electron"
      log "dependencies installed"
    else
      log "bun install failed:"
      tail -n 30 /tmp/bun-install.log
      exit 1
    fi
  else
    log "bun not found; skipping dependency install"
  fi
fi

log "done"
