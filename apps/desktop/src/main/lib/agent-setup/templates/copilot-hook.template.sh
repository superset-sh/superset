#!/bin/bash
{{MARKER}}
# Called by GitHub Copilot CLI hooks to notify Superset of agent lifecycle events
# Events: sessionStart → Start, sessionEnd → Stop, userPromptSubmitted → Start,
#         postToolUse → Start, preToolUse → PermissionRequest
# Copilot CLI hooks receive JSON via stdin and MUST output valid JSON to stdout

# Read JSON from stdin
INPUT=$(cat)

# Extract hook event name from the Copilot CLI JSON payload
# The event name is passed as the hook key, but we infer it from the
# "hook_name" or context. We receive it as the first argument from our
# hooks.json configuration (passed via the bash command).
EVENT_TYPE="$1"

# Map Copilot CLI event names to Superset event types
case "$EVENT_TYPE" in
  sessionStart)         EVENT_TYPE="Start" ;;
  sessionEnd)           EVENT_TYPE="Stop" ;;
  userPromptSubmitted)  EVENT_TYPE="Start" ;;
  postToolUse)          EVENT_TYPE="Start" ;;
  preToolUse)           EVENT_TYPE="PermissionRequest" ;;
  *)
    # Unknown event — output required JSON and exit
    printf '{}\n'
    exit 0
    ;;
esac

# Output required JSON response immediately to avoid blocking the agent
printf '{}\n'

# Skip notification if not inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && exit 0

curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
  --data-urlencode "eventType=$EVENT_TYPE" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
