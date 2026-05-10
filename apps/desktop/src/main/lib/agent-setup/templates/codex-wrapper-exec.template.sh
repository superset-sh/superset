# Codex's native notify callback only reports completion, so the wrapper uses
# Codex's process-scoped TUI session log for Start/permission events. Avoid
# tailing global rollout files: concurrent Codex sessions share that directory.
_superset_debug_enabled="0"
case "$SUPERSET_DEBUG_HOOKS" in
  1|true|TRUE|True|yes|YES|on|ON) _superset_debug_enabled="1" ;;
esac
if [ "$_superset_debug_enabled" != "1" ] && { [ "$SUPERSET_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; }; then
  _superset_debug_enabled="1"
fi

_superset_notify_path="{{NOTIFY_PATH}}"
_superset_debug_log="${SUPERSET_HOOK_DEBUG_LOG:-/tmp/superset-codex-hooks.log}"
_superset_has_superset_context="0"
[ -n "$SUPERSET_TERMINAL_ID$SUPERSET_TAB_ID$SUPERSET_PANE_ID" ] && _superset_has_superset_context="1"
SUPERSET_CODEX_SESSION_WATCHER_PID=""

_superset_debug() {
  [ "$_superset_debug_enabled" = "1" ] || return 0
  printf '%s [codex-wrapper] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)" "$*" >> "$_superset_debug_log" 2>/dev/null || true
}

_superset_child_pids_for() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -P "$1" 2>/dev/null || true
    return 0
  fi
  ps -axo pid=,ppid= 2>/dev/null | awk -v ppid="$1" '$2 == ppid { print $1 }' 2>/dev/null || true
}

_superset_cleanup_session_watcher() {
  if [ -n "$SUPERSET_CODEX_SESSION_WATCHER_PID" ]; then
    _superset_watcher_pid="$SUPERSET_CODEX_SESSION_WATCHER_PID"
    _superset_child_pids="$(_superset_child_pids_for "$_superset_watcher_pid" | tr '\n' ' ')"
    for _superset_child_pid in $_superset_child_pids; do
      kill -TERM "$_superset_child_pid" >/dev/null 2>&1 || true
    done
    kill -TERM "$_superset_watcher_pid" >/dev/null 2>&1 || true
    sleep 0.2
    _superset_child_pids="$_superset_child_pids $(_superset_child_pids_for "$_superset_watcher_pid" | tr '\n' ' ')"
    for _superset_child_pid in $_superset_child_pids; do
      kill -KILL "$_superset_child_pid" >/dev/null 2>&1 || true
    done
    kill -KILL "$_superset_watcher_pid" >/dev/null 2>&1 || true
    _superset_debug "session watcher cleanup signaled pid=$_superset_watcher_pid"
    SUPERSET_CODEX_SESSION_WATCHER_PID=""
  fi
}

_superset_exit_trap() {
  _superset_status=$?
  trap - EXIT HUP INT TERM
  _superset_cleanup_session_watcher
  exit "$_superset_status"
}

trap _superset_exit_trap EXIT HUP INT TERM

if [ "$_superset_has_superset_context" = "1" ] && [ -f "$_superset_notify_path" ]; then
  export CODEX_TUI_RECORD_SESSION="${CODEX_TUI_RECORD_SESSION:-1}"
  export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/superset-codex-session-$$_$(date +%s).jsonl"
  _superset_debug "session watcher starting terminalId=$SUPERSET_TERMINAL_ID tabId=$SUPERSET_TAB_ID paneId=$SUPERSET_PANE_ID log=$CODEX_TUI_SESSION_LOG_PATH notify=$_superset_notify_path"

  (
    _superset_notify="$_superset_notify_path"
    _superset_session_log="$CODEX_TUI_SESSION_LOG_PATH"

    _superset_emit_event() {
      _superset_payload=$(printf '{"hook_event_name":"%s"}' "$1")
      _superset_debug "emitting $1 via $_superset_notify"
      bash "$_superset_notify" "$_superset_payload" >/dev/null 2>&1 || true
    }

    _superset_i=0
    while [ ! -f "$_superset_session_log" ] && [ "$_superset_i" -lt 200 ]; do
      _superset_i=$((_superset_i + 1))
      sleep 0.1
    done
    if [ ! -f "$_superset_session_log" ]; then
      _superset_debug "session log not found path=$_superset_session_log"
      exit 0
    fi
    _superset_debug "watching session=$_superset_session_log"

    tail -n +1 -F "$_superset_session_log" 2>/dev/null | while IFS= read -r _superset_line; do
      case "$_superset_line" in
        *'"dir":"from_tui"'*'"kind":"op"'*'"UserTurn"'*) _superset_emit_event "Start" ;;
        *'_approval_request"'*) _superset_emit_event "PermissionRequest" ;;
      esac
    done
  ) 2>/dev/null &
  SUPERSET_CODEX_SESSION_WATCHER_PID=$!
  _superset_debug "session watcher pid=$SUPERSET_CODEX_SESSION_WATCHER_PID"
else
  _superset_notify_exists="0"
  [ -f "$_superset_notify_path" ] && _superset_notify_exists="1"
  _superset_debug "session watcher disabled hasSupersetContext=$_superset_has_superset_context terminalId=$SUPERSET_TERMINAL_ID tabId=$SUPERSET_TAB_ID paneId=$SUPERSET_PANE_ID notifyExists=$_superset_notify_exists notify=$_superset_notify_path"
fi

# `hooks` (formerly `codex_hooks`) is stable and default-enabled in codex
# >=0.129; the legacy `notify=...` callback remains the completion source.
"$REAL_BIN" --enable hooks -c 'notify=["bash","{{NOTIFY_PATH}}"]' "$@"
SUPERSET_CODEX_STATUS=$?
_superset_debug "codex exited status=$SUPERSET_CODEX_STATUS"

_superset_cleanup_session_watcher

trap - EXIT HUP INT TERM
exit "$SUPERSET_CODEX_STATUS"
