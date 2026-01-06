#!/bin/bash
{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Only run if inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && exit 0

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
# Use flexible pattern to handle optional whitespace: "key": "value" or "key":"value"
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$EVENT_TYPE" ]; then
  # Check for Codex "type" field (e.g., "agent-turn-complete")
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
  if [ "$CODEX_TYPE" = "agent-turn-complete" ]; then
    EVENT_TYPE="Stop"
  fi
fi

# NOTE: We intentionally do NOT default to "Stop" if EVENT_TYPE is empty.
# Parse failures should not trigger completion notifications.
# The server will ignore requests with missing eventType (forward compatibility).

# Map UserPromptSubmit to Start for simpler handling
[ "$EVENT_TYPE" = "UserPromptSubmit" ] && EVENT_TYPE="Start"

# If no event type was found, skip the notification
# This prevents parse failures from causing false completion notifications
[ -z "$EVENT_TYPE" ] && exit 0

# Timeouts prevent blocking agent completion if notification server is unresponsive
curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
  --data-urlencode "eventType=$EVENT_TYPE" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1
