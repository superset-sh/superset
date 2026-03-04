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
