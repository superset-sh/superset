#!/usr/bin/env bash
# setup.sh for a cloud workspace: the variables arrive in this process's own
# environment rather than a checkout's .env, and there is no machine state to
# copy. Runs from the start hook on every boot and does nothing after the
# first — a workspace's database and .env are ours to set up, not something
# the platform should carry a phase for.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/steps.sh"
cd "$ROOT_DIR" || exit 1

# The environment's variables, as a file, because step_write_env copies one.
# install -m 600 and the trap because that file holds every secret the
# environment carries.
cloud_write_environment_env() {
  local out="$1"
  local tmp
  tmp="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  while IFS= read -r -d '' entry; do
    local key="${entry%%=*}"
    local value="${entry#*=}"
    case "$key" in
      SUPERSET_*|HOST_SERVICE_*|VERCEL_*|IS_SANDBOX|PATH|HOME|PWD|OLDPWD|SHLVL|_|DISPLAY|TERM|SHELL|HOSTNAME|LANG|LC_*|NODE_ENV|PORT|TMUX*|USER|LOGNAME|MAIL|DEBIAN_FRONTEND) continue ;;
    esac
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" == *$'\n'* ]]; then
      local escaped="${value//\\/\\\\}"
      escaped="${escaped//\"/\\\"}"; escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
      escaped="${escaped//$'\n'/\\n}"
      printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
    elif [[ "$value" != *"'"* ]]; then
      printf "%s='%s'\n" "$key" "$value" >> "$tmp"
    else
      local escaped="${value//\\/\\\\}"
      escaped="${escaped//\"/\\\"}"; escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
      printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
    fi
  done < <(env -0)
  install -m 600 "$tmp" "$out"
}

# The branch name is derived, so this is how the script knows it already ran:
# the workspace's .env names its own database.
already_set_up() {
  [ -f "$ROOT_DIR/.env" ] || return 1
  grep -q "cloud-${SUPERSET_SANDBOX_WORKSPACE_ID}" "$ROOT_DIR/.env"
}

cloud_setup_main() {
  if already_set_up; then
    echo "This workspace already has its database and .env"
    return 0
  fi

  FAILED_STEPS=()
  SKIPPED_STEPS=()

  # The environment's variables land in .env beside the checkout either way —
  # step_write_env copies this file there. What this keeps out of the checkout
  # is the intermediate, and its mode.
  local env_source
  env_source="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$env_source'" EXIT
  export SUPERSET_ROOT_PATH="$env_source"
  cloud_write_environment_env "$env_source/.env" || step_failed "Read the environment"
  set -a
  # shellcheck source=/dev/null
  . "$env_source/.env"
  set +a

  # Cloud workspaces share a display name, so the branch is named after the id.
  # The whole id: the first block alone is 8 hex characters, and two
  # workspaces that collided would silently share one database.
  export SUPERSET_WORKSPACE_NAME="cloud-${SUPERSET_SANDBOX_WORKSPACE_ID}"

  step_setup_neon_branch || step_failed "Set up Neon branch"
  allocate_port_base || step_failed "Allocate port base"
  step_write_env || step_failed "Write .env file"
  step_seed_env_placeholders || step_failed "Seed .env placeholders"
  ( set -a; . "$ROOT_DIR/.env"; set +a; NODE_ENV=development bun run db:seed-dev ) ||
    step_failed "Seed dev account"

  print_summary "Cloud setup"
}

cloud_setup_main "$@"
