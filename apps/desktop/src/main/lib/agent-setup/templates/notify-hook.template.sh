#!/bin/bash
{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract Mastra identifiers when available (mastracode hooks)
# `resourceId` / `resource_id` is the Superset chat session id we assign via
# harness.setResourceId(...). `session_id` is Mastra's internal runtime id.
HOOK_SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
RESOURCE_ID=$(echo "$INPUT" | grep -oE '"resourceId"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$RESOURCE_ID" ]; then
  RESOURCE_ID=$(echo "$INPUT" | grep -oE '"resource_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
fi
SESSION_ID=${RESOURCE_ID:-$HOOK_SESSION_ID}

# v2 terminal hooks identify the runtime by terminalId. The v1 fallback still
# uses pane/tab/session fields, so keep its legacy guard when no host-service
# hook URL is available.
if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ]; then
  [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0
else
  [ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && exit 0
fi

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
# Use flexible pattern to handle optional whitespace: "key": "value" or "key":"value"
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$EVENT_TYPE" ]; then
  # Check for Codex "type" field when no native hook_event_name is present.
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
  case "$CODEX_TYPE" in
    agent-turn-complete|task_complete)
      EVENT_TYPE="Stop"
      ;;
    task_started)
      EVENT_TYPE="Start"
      ;;
    exec_approval_request|apply_patch_approval_request|request_user_input)
      EVENT_TYPE="PermissionRequest"
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
  echo "[notify-hook] event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
fi

# Escape backslashes and double quotes for safe JSON embedding.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# v2: host-service tRPC endpoint. The renderer subscribes over the event
# bus and plays the ringtone. Preferred when the URL is provided by
# host-service's terminal env. Endpoint is unauthenticated — it only
# broadcasts chimes, no auth header needed. Always captures the status
# so we can fall back to v1 when host-service is unreachable or the
# mutation returns non-2xx (restarts, crashes, transient errors).
if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\"}}"

  STATUS_CODE=$(curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
    --connect-timeout 2 --max-time 5 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)

  if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
    echo "[notify-hook] host-service dispatched status=$STATUS_CODE" >&2
  fi

  case "$STATUS_CODE" in
    2*) exit 0 ;;
  esac
fi

# v1 fallback: electron localhost server. Used by v1 terminals and when
# host-service is unreachable from the agent's shell.
# Timeouts prevent blocking agent completion if notification server is unresponsive
if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  STATUS_CODE=$(curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "sessionId=$SESSION_ID" \
    --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
    --data-urlencode "resourceId=$RESOURCE_ID" \
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
    --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
    --data-urlencode "resourceId=$RESOURCE_ID" \
    --data-urlencode "eventType=$EVENT_TYPE" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    > /dev/null 2>&1
fi

exit 0
