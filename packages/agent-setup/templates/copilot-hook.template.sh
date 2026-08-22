#!/bin/bash
{{MARKER}}
# GitHub Copilot CLI lifecycle hook. JSON in via stdin; MUST print valid
# JSON to stdout before exit so copilot doesn't block on the hook.

INPUT=$(cat)
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

EVENT_TYPE="$1"

case "$EVENT_TYPE" in
  sessionStart)         EVENT_TYPE="SessionStart" ;;
  sessionEnd)           EVENT_TYPE="SessionEnd" ;;
  userPromptSubmitted)  EVENT_TYPE="Start" ;;
  postToolUse)          EVENT_TYPE="Start" ;;
  preToolUse)           EVENT_TYPE="PermissionRequest" ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

printf '{}\n'

# The injected .github/hooks file persists in the worktree, so copilot run
# there outside Superset would still fire this; only Superset terminals set
# SUPERSET_* vars.
[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

V1_EVENT_TYPE="$EVENT_TYPE"
case "$V1_EVENT_TYPE" in
  SessionStart) V1_EVENT_TYPE="Start" ;;
  SessionEnd)   V1_EVENT_TYPE="Stop" ;;
esac

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Resolve the host-service endpoint at call time: the env URL is frozen at
# terminal creation and goes stale when the host-service restarts on a new
# port, while each org manifest is rewritten with the live endpoint on every
# start. Only the host that owns this terminal answers "ignored":false.
if [ -n "$SUPERSET_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

  HOOK_CANDIDATE_URLS="$SUPERSET_HOST_AGENT_HOOK_URL"
  for MANIFEST_FILE in "${SUPERSET_HOME_DIR:-$HOME/.superset}"/host/*/manifest.json; do
    [ -f "$MANIFEST_FILE" ] || continue
    MANIFEST_ENDPOINT=$(grep -oE '"endpoint"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | head -1 | grep -oE '"[^"]*"$' | tr -d '"')
    [ -n "$MANIFEST_ENDPOINT" ] || continue
    HOOK_CANDIDATE_URLS="$HOOK_CANDIDATE_URLS $MANIFEST_ENDPOINT/trpc/notifications.hook"
  done

  HOOK_DELIVERED_2XX="0"
  SEEN_HOOK_URLS=""
  for HOOK_URL in $HOOK_CANDIDATE_URLS; do
    case " $SEEN_HOOK_URLS " in *" $HOOK_URL "*) continue ;; esac
    SEEN_HOOK_URLS="$SEEN_HOOK_URLS $HOOK_URL"

    RESPONSE=$(curl -sX POST "$HOOK_URL" \
      --connect-timeout 2 --max-time 5 \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      -w "|%{http_code}" 2>/dev/null)
    STATUS_CODE="${RESPONSE##*|}"
    BODY="${RESPONSE%|*}"

    case "$BODY" in
      *'"ignored":false'*|*'"ignored": false'*) exit 0 ;;
    esac
    case "$STATUS_CODE" in
      2*) HOOK_DELIVERED_2XX="1" ;;
    esac
  done

  [ "$HOOK_DELIVERED_2XX" = "1" ] && exit 0
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
  --data-urlencode "rawEventType=$EVENT_TYPE" \
  --data-urlencode "agentId=$SUPERSET_AGENT_ID" \
  --data-urlencode "env=$SUPERSET_ENV" \
  --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
