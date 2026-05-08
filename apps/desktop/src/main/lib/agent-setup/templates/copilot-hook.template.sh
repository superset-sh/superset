#!/bin/bash
{{MARKER}}
# Called by GitHub Copilot CLI hooks. v2 host-service only.
# Events:
#   sessionStart           → SessionStart (server normalizes to Start)
#   sessionEnd             → SessionEnd   (server normalizes to Stop)
#   userPromptSubmitted    → Start
#   postToolUse            → Start
#   preToolUse             → PermissionRequest
# Copilot CLI hooks receive JSON via stdin and MUST output valid JSON to stdout.

INPUT=$(cat)
HOOK_SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"')

# Event name is passed as $1 from our hooks.json bash command.
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

# Must output valid JSON to avoid blocking the agent.
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
