#!/bin/bash
# The internal environment's setup hook: what a Superset engineer's box has
# beyond the image. Runs once as the sandbox user, with sudo, in the golden
# after the boot runner has checked the monorepo out under /workspace; the
# environment row stores it as its `setup` override, and a fork inherits the
# result. Its `start` counterpart is the repository's own dev-stack.cloud.sh.
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

# vercel, wrangler, eas: day-to-day deploy/build CLIs (Vercel projects,
# Cloudflare Workers apps, Expo mobile) an engineer reaches for directly
# instead of waiting on CI.
sudo npm install -g vercel wrangler eas-cli >/dev/null 2>&1 && log "vercel $(vercel --version 2>/dev/null), wrangler $(wrangler --version 2>/dev/null), eas $(eas --version 2>/dev/null) installed" || { log "vercel/wrangler/eas-cli install failed"; exit 1; }

# The dev stack and the workspace's database are the repository's own
# .superset/setup.cloud.sh and .superset/dev-stack.cloud.sh, run by the start
# hook. This environment only adds what is not in the repository: the shell
# tooling above, and neonctl, which setup.cloud.sh calls.

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
