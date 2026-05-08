# Tail codex's session rollout to drive per-turn lifecycle events. Codex's
# native `~/.codex/hooks.json` UserPromptSubmit hook isn't reliable in the
# 0.129+ TUI, so we shadow it with a rollout watcher: codex always writes
# `event_msg` lines to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl with
# payload.type ∈ {task_started, task_complete, user_message,
# *_approval_request} regardless of which hooks are enabled.
if [ -n "$SUPERSET_TERMINAL_ID" ] && [ -f "{{NOTIFY_PATH}}" ]; then
  (
    _superset_notify="{{NOTIFY_PATH}}"
    _superset_start_ts=$(date +%s 2>/dev/null || echo "0")
    _superset_sessions_dir="${HOME}/.codex/sessions"

    _superset_emit_event() {
      _superset_payload=$(printf '{"hook_event_name":"%s"}' "$1")
      bash "$_superset_notify" "$_superset_payload" >/dev/null 2>&1 || true
    }

    # Wait for codex to create our rollout file.
    _superset_rollout=""
    _superset_i=0
    while [ -z "$_superset_rollout" ] && [ "$_superset_i" -lt 200 ]; do
      _superset_rollout=$(find "$_superset_sessions_dir" -type f -name "rollout-*.jsonl" -newermt "@$_superset_start_ts" 2>/dev/null | sort | tail -1)
      [ -n "$_superset_rollout" ] && break
      _superset_i=$((_superset_i + 1))
      sleep 0.1
    done
    [ -z "$_superset_rollout" ] && exit 0

    tail -n 0 -F "$_superset_rollout" 2>/dev/null | while IFS= read -r _superset_line; do
      case "$_superset_line" in
        *'"type":"event_msg"'*'"task_started"'*) _superset_emit_event "Start" ;;
        *'"type":"event_msg"'*'"task_complete"'*) _superset_emit_event "Stop" ;;
        *'"type":"event_msg"'*'"user_message"'*) _superset_emit_event "Start" ;;
        *'"type":"event_msg"'*'_approval_request"'*) _superset_emit_event "PermissionRequest" ;;
      esac
    done
  ) &
  SUPERSET_CODEX_START_WATCHER_PID=$!
fi

# `hooks` (formerly `codex_hooks`) is stable and default-enabled in codex
# >=0.129; the alias still works but prints a deprecation warning. Use the
# canonical name. The legacy `notify=...` callback fires task_complete and
# survives even when the hook subsystem itself is disabled.
"$REAL_BIN" --enable hooks -c 'notify=["bash","{{NOTIFY_PATH}}"]' "$@"
SUPERSET_CODEX_STATUS=$?

if [ -n "$SUPERSET_CODEX_START_WATCHER_PID" ]; then
  kill "$SUPERSET_CODEX_START_WATCHER_PID" >/dev/null 2>&1 || true
  wait "$SUPERSET_CODEX_START_WATCHER_PID" 2>/dev/null || true
fi

exit "$SUPERSET_CODEX_STATUS"
