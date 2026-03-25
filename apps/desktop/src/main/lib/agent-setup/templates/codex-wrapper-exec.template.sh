# Codex exposes completion notifications via notify.
# For per-prompt Start notifications and permission requests, watch the TUI
# session log for task_started/exec_command_begin and *_approval_request events.
if [ -n "$SUPERSET_TAB_ID" ] && [ -f "{{NOTIFY_PATH}}" ]; then
  export CODEX_TUI_RECORD_SESSION=1
  if [ -z "$CODEX_TUI_SESSION_LOG_PATH" ]; then
    _superset_codex_ts="$(date +%s 2>/dev/null || echo "$$")"
    export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/superset-codex-session-$$_${_superset_codex_ts}.jsonl"
  fi

  (
    _superset_log="$CODEX_TUI_SESSION_LOG_PATH"
    _superset_notify="{{NOTIFY_PATH}}"
    _superset_last_turn_id=""
    _superset_last_approval_id=""
    _superset_last_exec_call_id=""
    _superset_approval_fallback_seq=0

    _superset_emit_event() {
      _superset_event="$1"
      _superset_payload=$(printf '{"hook_event_name":"%s"}' "$_superset_event")
      bash "$_superset_notify" "$_superset_payload" >/dev/null 2>&1 || true
    }

    # Wait briefly for codex to create the session log.
    _superset_i=0
    while [ ! -f "$_superset_log" ] && [ "$_superset_i" -lt 200 ]; do
      _superset_i=$((_superset_i + 1))
      sleep 0.05
    done
    if [ ! -f "$_superset_log" ]; then
      exit 0
    fi

    tail -n 0 -F "$_superset_log" 2>/dev/null | while IFS= read -r _superset_line; do
      case "$_superset_line" in
        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"task_started"'*)
          _superset_turn_id=$(printf '%s\n' "$_superset_line" | awk -F'"turn_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          [ -n "$_superset_turn_id" ] || _superset_turn_id="task_started"
          if [ "$_superset_turn_id" != "$_superset_last_turn_id" ]; then
            _superset_last_turn_id="$_superset_turn_id"
            _superset_emit_event "Start"
          fi
          ;;
        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"'*'_approval_request"'*)
          _superset_approval_id=$(printf '%s\n' "$_superset_line" | awk -F'"id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          [ -n "$_superset_approval_id" ] || _superset_approval_id=$(printf '%s\n' "$_superset_line" | awk -F'"approval_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          [ -n "$_superset_approval_id" ] || _superset_approval_id=$(printf '%s\n' "$_superset_line" | awk -F'"call_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          if [ -z "$_superset_approval_id" ]; then
            _superset_approval_fallback_seq=$((_superset_approval_fallback_seq + 1))
            _superset_approval_id="approval_request_${_superset_approval_fallback_seq}"
          fi
          if [ "$_superset_approval_id" != "$_superset_last_approval_id" ]; then
            _superset_last_approval_id="$_superset_approval_id"
            _superset_emit_event "PermissionRequest"
          fi
          ;;
        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"msg":{"type":"exec_command_begin"'*)
          _superset_exec_call_id=$(printf '%s\n' "$_superset_line" | awk -F'"call_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          if [ -n "$_superset_exec_call_id" ]; then
            if [ "$_superset_exec_call_id" != "$_superset_last_exec_call_id" ]; then
              _superset_last_exec_call_id="$_superset_exec_call_id"
              _superset_emit_event "Start"
            fi
          else
            _superset_emit_event "Start"
          fi
          ;;
      esac
    done
  ) &
  SUPERSET_CODEX_START_WATCHER_PID=$!
fi

_RELAY_BROKER="$(command -v agent-relay-broker 2>/dev/null || printf '%s\n' {{RELAY_BROKER_PATH_SHELL_ARG}})"
if [ -n "$_RELAY_BROKER" ] && [ -x "$_RELAY_BROKER" ]; then
  export RELAY_AGENT_NAME="${RELAY_AGENT_NAME:-${SUPERSET_TAB_ID:-codex-$$}}"
  export RELAY_CHANNELS="general"
  export RUST_LOG="${RUST_LOG:-error}"
  export RELAY_SKIP_PROMPT=1
  "$_RELAY_BROKER" wrap "$REAL_BIN" -- \
    -c 'mcp_servers.relaycast.command="npx"' \
    -c 'mcp_servers.relaycast.args=["-y", "@relaycast/mcp"]' \
    -c "mcp_servers.relaycast.env.RELAY_API_KEY=\"${RELAY_API_KEY}\"" \
    -c "mcp_servers.relaycast.env.RELAY_AGENT_NAME=\"${RELAY_AGENT_NAME}\"" \
    -c "mcp_servers.relaycast.env.RELAY_AGENT_TOKEN=\"${RELAY_AGENT_TOKEN}\"" \
    -c 'mcp_servers.relaycast.env.RELAY_SKIP_BOOTSTRAP="1"' \
    -c 'mcp_servers.relaycast.env.RELAY_STRICT_AGENT_NAME="1"' \
    -c {{NOTIFY_CONFIG_SHELL_ARG}} "$@"
else
  "$REAL_BIN" -c {{NOTIFY_CONFIG_SHELL_ARG}} "$@"
fi
SUPERSET_CODEX_STATUS=$?

if [ -n "$SUPERSET_CODEX_START_WATCHER_PID" ]; then
  kill "$SUPERSET_CODEX_START_WATCHER_PID" >/dev/null 2>&1 || true
  wait "$SUPERSET_CODEX_START_WATCHER_PID" 2>/dev/null || true
fi

exit "$SUPERSET_CODEX_STATUS"
