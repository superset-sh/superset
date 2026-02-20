#!/bin/bash
{{MARKER}}
# Called by Gemini CLI hooks to notify Superset of agent lifecycle events
# Events: BeforeAgent → Start, AfterAgent → Stop, AfterTool → Start
# Gemini hooks receive JSON via stdin and MUST output valid JSON to stdout

# Read JSON from stdin
INPUT=$(cat)

# Extract hook_event_name from Gemini's JSON payload
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# Map Gemini event names to Superset event types
case "$EVENT_TYPE" in
  BeforeAgent) EVENT_TYPE="Start" ;;
  AfterAgent)  EVENT_TYPE="Stop" ;;
  AfterTool)   EVENT_TYPE="Start" ;;
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
