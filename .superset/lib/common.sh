# Shared helpers for setup/teardown scripts.

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

error() { echo -e "${RED}✗${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

# Track step failure
step_failed() {
  FAILED_STEPS+=("$1")
}

# Track step skipped
step_skipped() {
  SKIPPED_STEPS+=("$1")
}

escape_env_value() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

write_env_var() {
  local key="$1"
  local value="${2-}"
  printf '%s="%s"\n' "$key" "$(escape_env_value "$value")"
}

acquire_port_alloc_lock() {
  local lock_dir="$1"
  local timeout_seconds="${2:-30}"
  local stale_seconds="${3:-300}"
  local waited=0

  while ! mkdir "$lock_dir" 2>/dev/null; do
    local cleaned_stale=false
    local lock_pid_file="$lock_dir/pid"
    local lock_pid=""

    if [ -f "$lock_pid_file" ]; then
      lock_pid="$(cat "$lock_pid_file" 2>/dev/null || true)"
      if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
        warn "Removing stale port allocation lock held by dead PID $lock_pid"
        rm -rf "$lock_dir" 2>/dev/null || true
        cleaned_stale=true
      fi
    fi

    if [ "$cleaned_stale" = false ]; then
      local lock_mtime=""
      lock_mtime=$(stat -f %m "$lock_dir" 2>/dev/null || stat -c %Y "$lock_dir" 2>/dev/null || true)
      if [ -n "$lock_mtime" ]; then
        local now
        now=$(date +%s)
        if [ $((now - lock_mtime)) -ge "$stale_seconds" ]; then
          warn "Removing stale port allocation lock older than ${stale_seconds}s"
          rm -rf "$lock_dir" 2>/dev/null || true
          cleaned_stale=true
        fi
      fi
    fi

    if [ "$cleaned_stale" = true ]; then
      continue
    fi

    if [ "$waited" -ge "$timeout_seconds" ]; then
      error "Timed out waiting for port allocation lock: $lock_dir"
      return 1
    fi

    sleep 1
    waited=$((waited + 1))
  done

  printf '%s\n' "$$" > "$lock_dir/pid" 2>/dev/null || true
  return 0
}

release_port_alloc_lock() {
  local lock_dir="$1"
  rm -rf "$lock_dir" 2>/dev/null || true
}

# Validate JSON output before parsing
validate_json() {
  local output="$1"
  local error_context="${2:-JSON validation}"

  if [ -z "$output" ]; then
    error "$error_context: Empty output"
    return 1
  fi

  if ! echo "$output" | jq empty 2>/dev/null; then
    error "$error_context: Invalid JSON output"
    echo "Raw output:" >&2
    echo "$output" >&2
    return 1
  fi

  return 0
}

# Print summary at the end
print_summary() {
  local title="$1"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 ${title} Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ${#FAILED_STEPS[@]} -eq 0 ] && [ ${#SKIPPED_STEPS[@]} -eq 0 ]; then
    echo -e "${GREEN}All steps completed successfully!${NC}"
  else
    if [ ${#SKIPPED_STEPS[@]} -gt 0 ]; then
      echo -e "${YELLOW}Skipped steps:${NC}"
      for step in "${SKIPPED_STEPS[@]}"; do
        echo "  - $step"
      done
    fi
    if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
      echo -e "${RED}Failed steps:${NC}"
      for step in "${FAILED_STEPS[@]}"; do
        echo "  - $step"
      done
    fi
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Return non-zero if any steps failed
  [ ${#FAILED_STEPS[@]} -eq 0 ]
}

# Returns 0 when env_file has a line `key=<non-empty value>`; `key=`, `key=""`
# and `key=''` count as unset because the schemas read an empty string as
# undefined (emptyStringAsUndefined).
env_file_has_value() {
  local env_file="$1"
  local key="$2"
  awk -v key="$key" -v dq='""' -v sq="''" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/[[:space:]]+$/, "", value)
      if (value != "" && value != dq && value != sq) { found = 1; exit }
    }
    END { exit found ? 0 : 1 }
  ' "$env_file"
}

# Appends to env_file every key that has a value in template but none in
# env_file. .env.local.example is the template: a fake value for every key
# packages/trpc/src/env.ts and apps/api/src/env.ts require, an empty value for
# every key that must stay unset, so it is the one list of required keys and
# their placeholder shapes.
seed_missing_env_placeholders() {
  local template="$1"
  local env_file="$2"

  if [ ! -f "$template" ]; then
    error "Template not found: $template"
    return 1
  fi
  if [ ! -f "$env_file" ]; then
    error "Env file not found: $env_file"
    return 1
  fi

  local key_line='^([A-Za-z_][A-Za-z0-9_]*)=(.*)$'
  local line key value
  local missing_lines=()
  local missing_keys=""
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ $key_line ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    case "$value" in
      ""|'""'|"''") continue ;;
    esac
    if env_file_has_value "$env_file" "$key"; then
      continue
    fi
    missing_lines+=("$line")
    missing_keys="${missing_keys:+$missing_keys }$key"
  done < "$template"

  if [ ${#missing_lines[@]} -eq 0 ]; then
    success "Every key with a value in $template already has one in $env_file"
    return 0
  fi

  {
    echo ""
    echo "# ===== Placeholders seeded by setup from $template ====="
    echo "# Each key below was missing or empty. The values are fakes that satisfy"
    echo "# the API env schemas; replace one with a real value when a feature needs it."
    printf '%s\n' "${missing_lines[@]}"
  } >> "$env_file"

  success "Seeded ${#missing_lines[@]} placeholder(s) into $env_file: $missing_keys"
  return 0
}
