#!/bin/bash
{{MARKER}}
# Called by Gemini CLI hooks. v2 host-service only.
# Events:
#   SessionStart, SessionEnd  → pass through (server normalizes to Start/Stop)
#   BeforeAgent               → Start (per-turn)
#   AfterAgent                → Stop  (per-turn)
#   AfterTool                 → Start (keeps the working indicator hot)
# Gemini hooks receive JSON via stdin and MUST output valid JSON to stdout.

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

# Output required JSON response immediately to avoid blocking the agent.
printf '{}\n'

# v2 only.
[ -z "$SUPERSET_TERMINAL_ID" ] && exit 0
[ -z "$SUPERSET_HOST_AGENT_HOOK_URL" ] && exit 0

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PAYLOAD="{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\"}}}"

curl -sX POST "$SUPERSET_HOST_AGENT_HOOK_URL" \
  --connect-timeout 2 --max-time 5 \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  > /dev/null 2>&1

exit 0
