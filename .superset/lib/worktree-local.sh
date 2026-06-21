# Shared helpers for worktree-local setup and lifecycle scripts.

worktree_sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48
}

worktree_physical_root() {
  local root="$1"
  (cd "$root" && pwd -P)
}

worktree_path_hash() {
  local root
  root="$(worktree_physical_root "$1")"
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$root" | shasum -a 1 | awk '{print substr($1, 1, 10)}'
    return
  fi
  if command -v sha1sum >/dev/null 2>&1; then
    printf '%s' "$root" | sha1sum | awk '{print substr($1, 1, 10)}'
    return
  fi
  printf '%s' "$root" | cksum | awk '{print $1}'
}

worktree_default_workspace_name() {
  local root="$1"
  local physical base hash short_base
  physical="$(worktree_physical_root "$root")"
  base="$(worktree_sanitize_name "$(basename "$physical")")"
  hash="$(worktree_path_hash "$physical")"
  short_base="$(printf '%s' "${base:-workspace}" | cut -c1-36)"
  printf '%s-%s' "$short_base" "$hash"
}

worktree_default_db_project() {
  printf 'superset-%s' "$(worktree_default_workspace_name "$1")"
}

worktree_expected_home_dir() {
  local root
  root="$(worktree_physical_root "$1")"
  printf '%s/superset-dev-data' "$root"
}

worktree_env_value() {
  local env_path="$1"
  local key="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
    }
    END {
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/\\"/, "\"", value)
      gsub(/\\\$/, "$", value)
      gsub(/\\\\/, "\\", value)
      print value
    }
  ' "$env_path"
}

worktree_env_requires_local_setup() {
  local root="$1"
  local env_path="$2"
  local expected_id expected_root expected_project expected_home
  expected_id="$(worktree_path_hash "$root")"
  expected_root="$(worktree_physical_root "$root")"
  expected_project="$(worktree_default_db_project "$root")"
  expected_home="$(worktree_expected_home_dir "$root")"

  if [ ! -f "$env_path" ]; then
    return 0
  fi
  if ! grep -q '^# ===== Local workspace overrides (setup.local.sh) =====$' "$env_path"; then
    return 0
  fi

  [ "$(worktree_env_value "$env_path" SUPERSET_WORKTREE_ID)" = "$expected_id" ] || return 0
  [ "$(worktree_env_value "$env_path" SUPERSET_WORKTREE_ROOT)" = "$expected_root" ] || return 0
  [ "$(worktree_env_value "$env_path" SUPERSET_HOME_DIR)" = "$expected_home" ] || return 0

  local local_db_project
  local_db_project="$(worktree_env_value "$env_path" LOCAL_DB_PROJECT)"
  if [ -z "$local_db_project" ]; then
    return 0
  fi
  case "$local_db_project" in
    *"$expected_id"*) ;;
    "$expected_project") ;;
    *) return 0 ;;
  esac

  local required_key
  for required_key in \
    SUPERSET_PORT_BASE \
    LOCAL_PG_PORT \
    LOCAL_NEON_PROXY_PORT \
    LOCAL_ELECTRIC_PORT \
    LOCAL_REDIS_PORT \
    LOCAL_KV_REST_PORT \
    DATABASE_URL \
    DATABASE_URL_UNPOOLED \
    KV_REST_API_URL \
    KV_URL \
    ELECTRIC_URL \
    NEXT_PUBLIC_ELECTRIC_URL \
    NEXT_PUBLIC_ELECTRIC_PROXY_URL \
    NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DESKTOP_URL \
    RELAY_URL \
    NEXT_PUBLIC_RELAY_URL; do
    [ -n "$(worktree_env_value "$env_path" "$required_key")" ] || return 0
  done

  local local_pg local_neon local_electric local_redis local_kv api_port desktop_port wrangler_port relay_port
  local_pg="$(worktree_env_value "$env_path" LOCAL_PG_PORT)"
  local_neon="$(worktree_env_value "$env_path" LOCAL_NEON_PROXY_PORT)"
  local_electric="$(worktree_env_value "$env_path" LOCAL_ELECTRIC_PORT)"
  local_redis="$(worktree_env_value "$env_path" LOCAL_REDIS_PORT)"
  local_kv="$(worktree_env_value "$env_path" LOCAL_KV_REST_PORT)"
  api_port="$(worktree_env_value "$env_path" API_PORT)"
  desktop_port="$(worktree_env_value "$env_path" DESKTOP_VITE_PORT)"
  wrangler_port="$(worktree_env_value "$env_path" WRANGLER_PORT)"
  relay_port="$(worktree_env_value "$env_path" RELAY_PORT)"
  [ -n "$api_port" ] || return 0
  [ -n "$desktop_port" ] || return 0
  [ -n "$wrangler_port" ] || return 0
  [ -n "$relay_port" ] || return 0

  worktree_url_uses_port "$(worktree_env_value "$env_path" DATABASE_URL)" "$local_neon" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" DATABASE_URL_UNPOOLED)" "$local_pg" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" KV_REST_API_URL)" "$local_kv" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" KV_URL)" "$local_redis" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" ELECTRIC_URL)" "$local_electric" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" NEXT_PUBLIC_API_URL)" "$api_port" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" NEXT_PUBLIC_DESKTOP_URL)" "$desktop_port" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" RELAY_URL)" "$relay_port" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" NEXT_PUBLIC_RELAY_URL)" "$relay_port" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" NEXT_PUBLIC_ELECTRIC_URL)" "$wrangler_port" || return 0
  worktree_url_uses_port "$(worktree_env_value "$env_path" NEXT_PUBLIC_ELECTRIC_PROXY_URL)" "$wrangler_port" || return 0

  return 1
}

worktree_url_uses_port() {
  local value="$1"
  local port="$2"
  case "$value" in
    *"//localhost:$port"*|*"//127.0.0.1:$port"*|*"@localhost:$port"*|*"@127.0.0.1:$port"*) return 0 ;;
    *) return 1 ;;
  esac
}

worktree_assert_url_port() {
  local label="$1"
  local value="$2"
  local port="$3"
  if [ -z "$port" ]; then
    error "$label expected port is not set"
    return 1
  fi
  if [ -z "$value" ]; then
    error "$label is not set"
    return 1
  fi
  if ! worktree_url_uses_port "$value" "$port"; then
    error "$label must point at localhost/127.0.0.1 port $port"
    return 1
  fi
  return 0
}

worktree_assert_current_local_env() {
  local root="$1"
  local expected_id expected_root expected_home
  expected_id="$(worktree_path_hash "$root")"
  expected_root="$(worktree_physical_root "$root")"
  expected_home="$(worktree_expected_home_dir "$root")"

  if [ "${SUPERSET_WORKTREE_ID:-}" != "$expected_id" ]; then
    error "SUPERSET_WORKTREE_ID does not match this worktree; run .superset/setup.local.sh"
    return 1
  fi
  if [ "${SUPERSET_WORKTREE_ROOT:-}" != "$expected_root" ]; then
    error "SUPERSET_WORKTREE_ROOT does not match this worktree; run .superset/setup.local.sh"
    return 1
  fi
  if [ "${SUPERSET_HOME_DIR:-}" != "$expected_home" ]; then
    error "SUPERSET_HOME_DIR must be the worktree-local dev profile: $expected_home"
    return 1
  fi
  if [ -z "${LOCAL_DB_PROJECT:-}" ]; then
    error "LOCAL_DB_PROJECT is not set"
    return 1
  fi
  case "$LOCAL_DB_PROJECT" in
    *"$expected_id"*) ;;
    *)
      error "LOCAL_DB_PROJECT must include this worktree id ($expected_id) to avoid cross-worktree compose collisions"
      return 1
      ;;
  esac

  worktree_assert_url_port DATABASE_URL "${DATABASE_URL:-}" "${LOCAL_NEON_PROXY_PORT:-}" || return 1
  worktree_assert_url_port DATABASE_URL_UNPOOLED "${DATABASE_URL_UNPOOLED:-}" "${LOCAL_PG_PORT:-}" || return 1
  worktree_assert_url_port KV_REST_API_URL "${KV_REST_API_URL:-}" "${LOCAL_KV_REST_PORT:-}" || return 1
  worktree_assert_url_port KV_URL "${KV_URL:-}" "${LOCAL_REDIS_PORT:-}" || return 1
  worktree_assert_url_port ELECTRIC_URL "${ELECTRIC_URL:-}" "${LOCAL_ELECTRIC_PORT:-}" || return 1
  worktree_assert_url_port NEXT_PUBLIC_API_URL "${NEXT_PUBLIC_API_URL:-}" "${API_PORT:-}" || return 1
  worktree_assert_url_port NEXT_PUBLIC_DESKTOP_URL "${NEXT_PUBLIC_DESKTOP_URL:-}" "${DESKTOP_VITE_PORT:-}" || return 1
  worktree_assert_url_port RELAY_URL "${RELAY_URL:-}" "${RELAY_PORT:-}" || return 1
  worktree_assert_url_port NEXT_PUBLIC_RELAY_URL "${NEXT_PUBLIC_RELAY_URL:-}" "${RELAY_PORT:-}" || return 1

  if ! worktree_url_uses_port "${NEXT_PUBLIC_ELECTRIC_URL:-}" "${WRANGLER_PORT:-}"; then
    error "NEXT_PUBLIC_ELECTRIC_URL must point at the local Wrangler Electric proxy port $WRANGLER_PORT"
    return 1
  fi
  if ! worktree_url_uses_port "${NEXT_PUBLIC_ELECTRIC_PROXY_URL:-}" "${WRANGLER_PORT:-}"; then
    error "NEXT_PUBLIC_ELECTRIC_PROXY_URL must point at the local Wrangler Electric proxy port $WRANGLER_PORT"
    return 1
  fi
}
