#!/bin/bash
{{MARKER}}
# Called by GitHub Copilot CLI hooks to notify Superset of agent lifecycle events
#
# Copilot CLI v1.0.22+ changed sessionEnd to fire once per session instead of
# per prompt (github/copilot-cli#991). To detect per-turn completion,
# userPromptSubmitted now emits Stop (previous turn done) then Start (new turn).
#
# Copilot CLI hooks receive JSON via stdin and MUST output valid JSON to stdout.
# v1.0.22+ may block waiting for hook stdout before closing stdin, so we must
# output JSON before attempting to drain stdin to prevent a deadlock.

# Must output valid JSON immediately — Copilot CLI v1.0.22+ blocks until it
# receives hook output while keeping stdin open. Outputting before draining
# prevents a deadlock where both sides wait on each other.
printf '{}\n'

# Drain stdin in the background to prevent broken-pipe errors on the agent side
cat > /dev/null 2>&1 &

# Event name is passed as $1 from our hooks.json bash command
EVENT_TYPE="$1"

[ -z "$SUPERSET_TAB_ID" ] && exit 0

_superset_notify() {
  curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "eventType=$1" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    > /dev/null 2>&1
}

case "$EVENT_TYPE" in
  sessionStart)
    _superset_notify "Start"
    ;;
  sessionEnd)
    _superset_notify "Stop"
    ;;
  userPromptSubmitted)
    # Copilot CLI v1.0.22+ fires sessionEnd once per session, not per prompt.
    # A new prompt submission implies the previous turn completed, so emit Stop
    # for the finished turn then Start for the new one.
    _superset_notify "Stop"
    _superset_notify "Start"
    ;;
  postToolUse)
    _superset_notify "Start"
    ;;
  preToolUse)
    _superset_notify "PermissionRequest"
    ;;
esac

exit 0
