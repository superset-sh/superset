#!/bin/bash
{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract Mastra session ID when available (mastracode hooks)
SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# Skip if this isn't a Superset terminal hook and no Mastra session context exists
[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && exit 0

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

# Only UserPromptSubmit is mapped here; other events are normalized
# server-side by mapEventType() to keep a single source of truth.
[ "$EVENT_TYPE" = "UserPromptSubmit" ] && EVENT_TYPE="Start"

# If no event type was found, skip the notification
# This prevents parse failures from causing false completion notifications
[ -z "$EVENT_TYPE" ] && exit 0

DEBUG_HOOKS_ENABLED="0"
if [ -n "$SUPERSET_DEBUG_HOOKS" ]; then
  case "$SUPERSET_DEBUG_HOOKS" in
    1|true|TRUE|True|yes|YES|on|ON)
      DEBUG_HOOKS_ENABLED="1"
      ;;
    *)
      DEBUG_HOOKS_ENABLED="0"
      ;;
  esac
elif [ "$SUPERSET_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; then
  DEBUG_HOOKS_ENABLED="1"
fi

if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  echo "[notify-hook] event=$EVENT_TYPE sessionId=$SESSION_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
fi

# Timeouts prevent blocking agent completion if notification server is unresponsive
if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  STATUS_CODE=$(curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "sessionId=$SESSION_ID" \
    --data-urlencode "eventType=$EVENT_TYPE" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)
  echo "[notify-hook] dispatched status=$STATUS_CODE" >&2
else
  curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "sessionId=$SESSION_ID" \
    --data-urlencode "eventType=$EVENT_TYPE" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    > /dev/null 2>&1
fi

exit 0
