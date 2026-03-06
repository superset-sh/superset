#!/bin/bash
{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

INPUT_COMPACT=$(printf '%s' "$INPUT" | tr '\n' ' ')

extract_json_field() {
  KEY="$1"

  if command -v jq >/dev/null 2>&1; then
    VALUE=$(printf '%s' "$INPUT" | jq -r --arg key "$KEY" 'if type == "object" then .[$key] // empty else empty end' 2>/dev/null | head -n 1)
    if [ -n "$VALUE" ] && [ "$VALUE" != "null" ]; then
      printf '%s' "$VALUE"
      return
    fi
  fi

  printf '%s' "$INPUT_COMPACT" | grep -oE "\"${KEY}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}

# Extract Mastra session ID when available (mastracode hooks)
SESSION_ID=$(extract_json_field "session_id")

# Skip if this isn't a Superset terminal hook and no Mastra session context exists
[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && exit 0

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
# Use flexible parsing to handle pretty JSON with newlines or spaces.
EVENT_TYPE=$(extract_json_field "hook_event_name")
if [ -z "$EVENT_TYPE" ]; then
  # Check for Codex "type" field (e.g., "agent-turn-complete")
  CODEX_TYPE=$(extract_json_field "type")
  if [ "$CODEX_TYPE" = "agent-turn-complete" ]; then
    EVENT_TYPE="Stop"
  fi
fi

# Claude Notification hooks include a subtype matcher (idle_prompt, permission_prompt, etc.)
NOTIFICATION_TYPE=$(extract_json_field "notification_type")
[ -z "$NOTIFICATION_TYPE" ] && NOTIFICATION_TYPE=$(extract_json_field "notificationType")
[ -z "$NOTIFICATION_TYPE" ] && NOTIFICATION_TYPE=$(extract_json_field "matcher")

if [ "$EVENT_TYPE" = "Notification" ] || [ "$EVENT_TYPE" = "notification" ]; then
  case "$NOTIFICATION_TYPE" in
    permission_prompt|PermissionPrompt|elicitation_dialog|ElicitationDialog)
      EVENT_TYPE="PermissionRequest"
      ;;
    idle_prompt|IdlePrompt|auth_success|AuthSuccess)
      EVENT_TYPE="Stop"
      ;;
  esac
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
  echo "[notify-hook] event=$EVENT_TYPE notificationType=$NOTIFICATION_TYPE sessionId=$SESSION_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
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
    --data-urlencode "notificationType=$NOTIFICATION_TYPE" \
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
    --data-urlencode "notificationType=$NOTIFICATION_TYPE" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    > /dev/null 2>&1
fi

exit 0
