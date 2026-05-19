#!/usr/bin/env bash
#
# Bootstrap a fresh Sprite VM to host Superset workspaces.
#
# Sprite-level setup only — installs system tooling, clones the repo, places
# the root .env, and registers docker/superset as persistent services. It does
# NOT create Neon branches or start Electric containers; those are per-workspace
# concerns handled by .superset/setup.sh inside each worktree.
#
# Usage:
#   bootstrap-sprite.sh <path-to-source-env>
#
# Prereqs (manual):
#   - gh CLI authenticated (run: gh auth login)
#   - A source .env file with prod-level shared credentials
#     (NEON_API_KEY/ORG_ID/PROJECT_ID, BETTER_AUTH_SECRET, OAuth keys, etc.)
#
# After this script (manual):
#   - superset auth login
#   - .superset/setup.sh inside any worktree you create

set -euo pipefail

SOURCE_ENV="${1:-}"
REPO_DIR="$HOME/code/superset"
NODE_BIN="/.sprite/languages/node/nvm/versions/node/v22.20.0/bin"

GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
RESET=$'\033[0m'

info() { printf "%s==>%s %s\n" "$GREEN" "$RESET" "$1"; }
warn() { printf "%swarning:%s %s\n" "$YELLOW" "$RESET" "$1" >&2; }
die()  { printf "%serror:%s %s\n" "$RED" "$RESET" "$1" >&2; exit 1; }

if [[ -z "$SOURCE_ENV" ]]; then
  die "missing arg: path to source .env file. Usage: $(basename "$0") <env-path>"
fi
[[ -f "$SOURCE_ENV" ]] || die "source env not found: $SOURCE_ENV"

# Make node-installed CLIs (neonctl, etc.) reachable in this script's PATH.
export PATH="$NODE_BIN:$PATH"

# ----- 1. Sanity checks -----------------------------------------------------
info "Checking prerequisites"
command -v gh >/dev/null || die "gh CLI missing (should be pre-installed on Sprite)"
command -v bun >/dev/null || die "bun missing (should be pre-installed on Sprite)"
command -v node >/dev/null || die "node missing (should be pre-installed on Sprite)"
gh auth status >/dev/null 2>&1 || die "gh not authenticated; run: gh auth login"

# ----- 2. System packages ---------------------------------------------------
APT_PACKAGES=(docker.io jq postgresql-client libnss3-tools direnv)
APT_NEEDED=()
for pkg in "${APT_PACKAGES[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || APT_NEEDED+=("$pkg")
done

if (( ${#APT_NEEDED[@]} > 0 )); then
  info "Installing apt packages: ${APT_NEEDED[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y "${APT_NEEDED[@]}"
else
  info "apt packages already installed"
fi

# ----- 3. Caddy -------------------------------------------------------------
if ! command -v caddy >/dev/null; then
  info "Installing caddy"
  sudo curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" \
    -o /usr/local/bin/caddy
  sudo chmod +x /usr/local/bin/caddy
else
  info "caddy already installed ($(caddy version | head -1))"
fi

# ----- 4. Node global tools -------------------------------------------------
NPM_GLOBALS=(neonctl node-gyp)
for pkg in "${NPM_GLOBALS[@]}"; do
  if ! npm ls -g --depth=0 "$pkg" >/dev/null 2>&1; then
    info "Installing $pkg"
    npm install -g "$pkg"
  else
    info "$pkg already installed"
  fi
done

# Persist node bin on PATH for new shells (idempotent).
for rc in "$HOME/.zshrc" "$HOME/.profile"; do
  [[ -f "$rc" ]] || continue
  if ! grep -qF "$NODE_BIN" "$rc"; then
    info "Adding $NODE_BIN to PATH in $rc"
    printf '\nexport PATH="%s:$PATH"\n' "$NODE_BIN" >> "$rc"
  fi
done

# ----- 5. Docker daemon as Sprite service -----------------------------------
if sprite-env services list 2>/dev/null | grep -q '"name":"dockerd"'; then
  info "dockerd sprite service already registered"
else
  info "Registering dockerd as a Sprite service"
  sprite-env services create dockerd --cmd sudo --args "dockerd,--iptables=false" \
    >/dev/null
fi

# Wait for the daemon socket — sprite-env returns when the service is launched
# but the socket may not be live for a second or two.
for i in {1..30}; do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 1
done
docker info >/dev/null || die "docker daemon failed to come up"

# ----- 6. Repo + root .env --------------------------------------------------
if [[ ! -d "$REPO_DIR/.git" ]]; then
  info "Cloning superset-sh/superset to $REPO_DIR"
  mkdir -p "$(dirname "$REPO_DIR")"
  gh repo clone superset-sh/superset "$REPO_DIR"
else
  info "Repo already present at $REPO_DIR"
fi

if [[ ! -f "$REPO_DIR/.env" ]]; then
  info "Copying source env to $REPO_DIR/.env"
  cp "$SOURCE_ENV" "$REPO_DIR/.env"
  chmod 600 "$REPO_DIR/.env"
else
  warn ".env already present at $REPO_DIR/.env — leaving untouched"
fi

# ----- 7. Bun install -------------------------------------------------------
if [[ ! -d "$REPO_DIR/node_modules" ]]; then
  info "Installing JS dependencies (bun install)"
  (cd "$REPO_DIR" && bun install)
else
  info "node_modules already present — skipping bun install (run manually if needed)"
fi

# ----- 8. Caddyfile ---------------------------------------------------------
if [[ ! -f "$REPO_DIR/Caddyfile" && -f "$REPO_DIR/Caddyfile.example" ]]; then
  info "Creating Caddyfile from example"
  cp "$REPO_DIR/Caddyfile.example" "$REPO_DIR/Caddyfile"
fi

# ----- 9. Claude Code CLI ---------------------------------------------------
# Pre-installed on stock Sprite images but install if missing on bare boxes.
if ! command -v claude >/dev/null; then
  info "Installing Claude Code"
  curl -fsSL https://claude.ai/install.sh | bash
else
  info "Claude Code already installed"
fi

# ----- 10. direnv hook ------------------------------------------------------
# Each worktree's setup.sh sources the root .env via direnv; the hook needs to
# be installed in the user's shell rc once.
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [[ -f "$rc" ]] || continue
  if ! grep -qF "direnv hook" "$rc"; then
    info "Adding direnv hook to $rc"
    case "$rc" in
      *zshrc)  echo 'eval "$(direnv hook zsh)"'  >> "$rc" ;;
      *bashrc) echo 'eval "$(direnv hook bash)"' >> "$rc" ;;
    esac
  fi
done

# ----- 11. Superset CLI -----------------------------------------------------
if ! command -v superset >/dev/null && [[ ! -x "$HOME/superset/bin/superset" ]]; then
  info "Installing Superset CLI"
  curl -fsSL https://superset.sh/cli/install.sh | sh
else
  info "Superset CLI already installed"
fi

# ----- Done -----------------------------------------------------------------
cat <<EOF

${GREEN}Bootstrap complete.${RESET}

Next steps (manual):
  1. Open a new shell so PATH/direnv hooks take effect.
  2. ${YELLOW}superset auth login${RESET}     (browser/device flow)
  3. ${YELLOW}claude /login${RESET}            (or set ANTHROPIC_API_KEY for headless use)
  4. ${YELLOW}superset start${RESET}           (launches host-service daemon)
  5. To create a workspace (worktree):
     ${YELLOW}superset workspaces create --local --project <project-id> --name <name> --branch <branch>${RESET}
  6. Inside the worktree, run ${YELLOW}.superset/setup.sh${RESET} to provision a Neon branch + Electric container.
EOF
