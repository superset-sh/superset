#!/bin/bash
{{MARKER}}
# Called by CLI agents (Claude Code, Codex, etc.) on lifecycle events.
# v2 host-service only — POSTs an AgentIdentity-bearing payload to
# $SUPERSET_HOST_AGENT_HOOK_URL. Outside a Superset terminal (no
# SUPERSET_TERMINAL_ID) the script is a no-op.

# Get JSON input — Codex passes as argument, Claude pipes to stdin.
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Agent-native session id, lifted into AgentIdentity.sessionId.
HOOK_SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# v2 only — no terminal id, no v2 hook URL → nothing to do.
[ -z "$SUPERSET_TERMINAL_ID" ] && exit 0
[ -z "$SUPERSET_HOST_AGENT_HOOK_URL" ] && exit 0

# Extract event type — Claude/Mastra/Droid use "hook_event_name", Codex uses "type".
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
if [ -z "$EVENT_TYPE" ]; then
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

# UserPromptSubmit normalizes here; other events normalized server-side
# by mapEventType() to keep a single source of truth.
[ "$EVENT_TYPE" = "UserPromptSubmit" ] && EVENT_TYPE="Start"

# Skip if no event type — never default to "Stop" on parse failure.
[ -z "$EVENT_TYPE" ] && exit 0

DEBUG_HOOKS_ENABLED="0"
if [ -n "$SUPERSET_DEBUG_HOOKS" ]; then
  case "$SUPERSET_DEBUG_HOOKS" in
    1|true|TRUE|True|yes|YES|on|ON)
      DEBUG_HOOKS_ENABLED="1"
      ;;
  esac
elif [ "$SUPERSET_ENV" = "development" ] || [ "$NODE_ENV" = "development" ]; then
  DEBUG_HOOKS_ENABLED="1"
fi

if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  echo "[notify-hook] event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID hookSessionId=$HOOK_SESSION_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
fi

# Escape backslashes and double quotes for safe JSON embedding.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# `agent` carries the wrapper-stamped identity. Empty fields are normalized
# away on the receiver, so we always emit the object — the wrapper sets
# SUPERSET_AGENT_ID and the agent's own JSON payload yields HOOK_SESSION_ID.
PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

STATUS_CODE=$(curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
  --connect-timeout 2 --max-time 5 \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -o /dev/null -w "%{http_code}" 2>/dev/null)

if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  echo "[notify-hook] dispatched status=$STATUS_CODE" >&2
fi

exit 0
