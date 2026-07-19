#!/bin/bash
{{MARKER}}
# Antigravity CLI (`agy`) lifecycle hook. JSON in via stdin; MUST print valid
# JSON to stdout before exit or the agent loop stalls -- Antigravity runs hooks
# synchronously and blocks on them.
#
# Unlike other agents, Antigravity's hook payload carries no event-name field
# (common fields are conversationId/workspacePaths/transcriptPath/modelName
# only), so hooks.json passes the Superset event as argv $1.

EVENT_TYPE="$1"

case "$EVENT_TYPE" in
  Start|Stop) ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

INPUT=$(cat)

# Payload keys are camelCase (protojson). conversationId is Antigravity's
# session identifier.
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"conversationId"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# Emit before dispatching. An empty object is the no-op result for every event
# we register: PreInvocation/PostInvocation treat injectSteps as optional,
# PostToolUse expects exactly {}, and Stop only blocks termination when
# decision is "continue".
printf '{}\n'

# Antigravity is already invoked with Superset's own event names, so no
# remapping is needed -- the alias keeps the v1 payload shape identical to the
# other agent hook templates.
V1_EVENT_TYPE="$EVENT_TYPE"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ -n "$SUPERSET_HOST_AGENT_HOOK_URL" ] && [ -n "$SUPERSET_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

  STATUS_CODE=$(curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
    --connect-timeout 2 --max-time 5 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)

  case "$STATUS_CODE" in
    2*) exit 0 ;;
    *) echo "[antigravity-hook] host-service dispatch failed status=$STATUS_CODE; falling back to v1" >&2 ;;
  esac
fi

[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0

curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
  --data-urlencode "terminalId=$SUPERSET_TERMINAL_ID" \
  --data-urlencode "sessionId=$HOOK_SESSION_ID" \
  --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
  --data-urlencode "eventType=$V1_EVENT_TYPE" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
