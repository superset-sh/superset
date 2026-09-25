#!/bin/bash
{{MARKER}}
# Gemini CLI lifecycle hook. JSON in via stdin; MUST print valid JSON to
# stdout before exit so gemini doesn't block on the hook.

INPUT=$(cat)

EVENT_TYPE=$(printf '%s' "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

case "$EVENT_TYPE" in
  BeforeAgent)              EVENT_TYPE="Start" ;;
  AfterAgent)               EVENT_TYPE="Stop"  ;;
  AfterTool)                EVENT_TYPE="Start" ;;
  SessionStart|SessionEnd)  ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

printf '{}\n'

# ~/.gemini/settings.json is global, so this also fires in sessions launched
# outside Superset terminals; only those terminals set SUPERSET_* vars.
[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

# The wrapper's identity, or gemini when launched without one. Another
# agent's identity means gemini is running under it (a tool call), which is
# not this terminal's lifecycle.
AGENT_ID="${SUPERSET_AGENT_ID:-gemini}"
[ "$AGENT_ID" = "gemini" ] || exit 0


json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Resolve the host-service endpoint at call time: the env URL is frozen at
# terminal creation and goes stale when the host-service restarts on a new
# port, while each org manifest is rewritten with the live endpoint on every
# start. Only the host that owns this terminal answers "ignored":false.
if [ -n "$SUPERSET_TERMINAL_ID" ]; then
  PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

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
      *) echo "[gemini-hook] host-service dispatch failed status=$STATUS_CODE url=$HOOK_URL" >&2 ;;
    esac
  done

  [ "$HOOK_DELIVERED_2XX" = "1" ] && exit 0
fi

exit 0
