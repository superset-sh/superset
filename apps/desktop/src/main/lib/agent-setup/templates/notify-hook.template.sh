#!/bin/bash
{{MARKER}}
# CLI agent lifecycle hook — POSTs an AgentIdentity payload to the v2
# host-service endpoint, with a v1 Electron hook fallback while both
# terminal stacks are supported.

# Codex passes JSON as argv; Claude/Mastra/Droid pipe via stdin.
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

HOOK_SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
RESOURCE_ID=$(echo "$INPUT" | grep -oE '"resourceId"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$RESOURCE_ID" ]; then
  RESOURCE_ID=$(echo "$INPUT" | grep -oE '"resource_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
fi
SESSION_ID=${RESOURCE_ID:-$HOOK_SESSION_ID}

# Claude/Mastra/Droid use "hook_event_name"; Codex uses "type".
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$EVENT_TYPE" ]; then
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
  case "$CODEX_TYPE" in
    agent-turn-complete|task_complete) EVENT_TYPE="Stop" ;;
    task_started) EVENT_TYPE="Start" ;;
    exec_approval_request|apply_patch_approval_request|request_user_input)
      EVENT_TYPE="PermissionRequest"
      ;;
  esac
fi

# UserPromptSubmit normalizes here; other aliases are mapped server-side
# by mapEventType so the wire stays a single source of truth.
[ "$EVENT_TYPE" = "UserPromptSubmit" ] && EVENT_TYPE="Start"

# Never default to "Stop" on parse failure — silent drop is safer than
# a false completion notification.
[ -z "$EVENT_TYPE" ] && exit 0

DEBUG_HOOKS_ENABLED="0"
if [ -n "$SUPERSET_DEBUG_HOOKS" ]; then
  case "$SUPERSET_DEBUG_HOOKS" in
    1|true|TRUE|True|yes|YES|on|ON) DEBUG_HOOKS_ENABLED="1" ;;
  esac
elif [ "$SUPERSET_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; then
  DEBUG_HOOKS_ENABLED="1"
fi

if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  echo "[notify-hook] event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
fi

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ] && [ -n "$SUPERSET_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$SESSION_ID")\"}}}"

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

# v1 fallback: Electron localhost hook server. Kept while v1 terminals exist.
[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && exit 0

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
  echo "[notify-hook] v1 dispatched status=$STATUS_CODE" >&2
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
