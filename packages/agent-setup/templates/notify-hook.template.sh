#!/bin/bash
{{MARKER}}
# CLI agent lifecycle hook — POSTs an AgentIdentity payload to the v2
# host-service endpoint, with a v1 Electron hook fallback while both
# terminal stacks are supported.

# Codex passes JSON as argv; Claude/Mastra/Droid/Kimi/Grok pipe via stdin.
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Agent hook configs are global, so this can fire in sessions launched
# outside Superset terminals (including via stale entries from older
# installs). Only Superset terminals set SUPERSET_* vars; the agent-supplied
# payload alone must never dispatch.
[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

# Claude Code and Codex set agent_id only when the hook fires inside a
# subagent (Task tool / spawn_agent). Subagent activity must not drive
# terminal-level agent status, notifications, or the session id binding —
# only the main loop counts. It is forwarded separately so the host can keep
# a per-terminal roster of live subagents (see notifications.hook).
# Snake_case is the Claude schema shared by Codex and most forks; camelCase
# covers harnesses that serialize like Grok. Add an alias here, nothing
# downstream cares which spelling arrived.
# First match only: a key can recur in nested objects (Claude's SubagentStop
# repeats agent_type inside background_tasks), and a multi-line value would
# break the JSON payload built from it.
json_field() {
  for KEY in "$@"; do
    VALUE=$(echo "$INPUT" | grep -oE "\"$KEY\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | grep -oE '"[^"]*"$' | tr -d '"')
    [ -n "$VALUE" ] && { printf '%s' "$VALUE"; return; }
  done
}
SUBAGENT_ID=$(json_field agent_id agentId)
SUBAGENT_TYPE=$(json_field agent_type agentType)
# transcript_path is the file the hook ran against (Claude: the parent
# session; Codex: the child's own rollout); agent_transcript_path is the
# child's transcript on SubagentStop. The host derives the child's file from
# them so the subagent pane can follow it.
TRANSCRIPT_PATH=$(json_field transcript_path transcriptPath)
AGENT_TRANSCRIPT_PATH=$(json_field agent_transcript_path agentTranscriptPath)

HOOK_SESSION_ID=$(json_field session_id sessionId)
RESOURCE_ID=$(json_field resourceId resource_id)
SESSION_ID=${RESOURCE_ID:-$HOOK_SESSION_ID}
if [ -z "$SESSION_ID" ]; then
  # Codex's legacy notify callback (agent-turn-complete) carries the
  # resumable id as thread-id — the same id `codex resume` takes.
  SESSION_ID=$(json_field thread-id thread_id)
fi

# Claude/Mastra/Droid/Kimi use "hook_event_name"; Grok uses camelCase
# "hookEventName" (snake_case values, mapped server-side); Codex uses "type".
EVENT_TYPE=$(json_field hook_event_name hookEventName)
if [ -z "$EVENT_TYPE" ]; then
  CODEX_TYPE=$(json_field type)
  case "$CODEX_TYPE" in
    agent-turn-complete|task_complete) EVENT_TYPE="Stop" ;;
    task_started) EVENT_TYPE="Start" ;;
    exec_approval_request|apply_patch_approval_request|request_user_input)
      EVENT_TYPE="PermissionRequest"
      ;;
  esac
fi

# Grok serializes its configured Notification event as lowercase
# "notification". Only subtypes where the agent is blocked waiting on the
# user count: permission_prompt (tool/plan approval) and elicitation_dialog
# (ask_user_question — the common case, since Superset launches grok with
# --always-approve so tool approvals rarely prompt). Keep the case pattern
# in sync with GROK_BLOCKING_NOTIFICATION_TYPES in agent-wrappers-grok.ts.
if [ "$EVENT_TYPE" = "notification" ]; then
  NOTIFICATION_TYPE=$(json_field notificationType notification_type)
  case "$NOTIFICATION_TYPE" in
    permission_prompt|elicitation_dialog) EVENT_TYPE="PermissionRequest" ;;
    *) exit 0 ;;
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
  echo "[notify-hook] event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID subagentId=$SUBAGENT_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID paneId=$SUPERSET_PANE_ID tabId=$SUPERSET_TAB_ID workspaceId=$SUPERSET_WORKSPACE_ID" >&2
fi

debug_log() {
  [ "$DEBUG_HOOKS_ENABLED" = "1" ] || return 0
  printf '%s [notify-hook] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)" "$*" >> "${SUPERSET_HOOK_DEBUG_LOG:-/tmp/superset-agent-hooks.log}" 2>/dev/null || true
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Resolve the host-service endpoint at call time. SUPERSET_HOST_AGENT_HOOK_URL
# is frozen into the agent's env at terminal creation; after a host-service
# restart on a new port it would point at a dead socket forever (a live
# process's env can't change). Each org's manifest
# (~/.superset/host/<orgId>/manifest.json) is rewritten with the live endpoint
# on every start, so it never goes stale. Try the env URL first (fast path),
# then every org manifest's endpoint. Only the host that owns this terminal
# answers "ignored":false; probing the other orgs' hosts is a harmless no-op.
#
# Sets HOOK_ACCEPTED=1 when an owning host took the event and
# HOOK_DELIVERED_2XX=1 when any host answered 2xx.
dispatch_to_host() {
  DISPATCH_PAYLOAD="$1"
  HOOK_ACCEPTED="0"
  HOOK_DELIVERED_2XX="0"
  HOOK_CANDIDATE_URLS="$SUPERSET_HOST_AGENT_HOOK_URL"
  for MANIFEST_FILE in "${SUPERSET_HOME_DIR:-$HOME/.superset}"/host/*/manifest.json; do
    [ -f "$MANIFEST_FILE" ] || continue
    MANIFEST_ENDPOINT=$(grep -oE '"endpoint"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | head -1 | grep -oE '"[^"]*"$' | tr -d '"')
    [ -n "$MANIFEST_ENDPOINT" ] || continue
    HOOK_CANDIDATE_URLS="$HOOK_CANDIDATE_URLS $MANIFEST_ENDPOINT/trpc/notifications.hook"
  done

  SEEN_HOOK_URLS=""
  for HOOK_URL in $HOOK_CANDIDATE_URLS; do
    case " $SEEN_HOOK_URLS " in *" $HOOK_URL "*) continue ;; esac
    SEEN_HOOK_URLS="$SEEN_HOOK_URLS $HOOK_URL"

    RESPONSE=$(curl -sX POST "$HOOK_URL" \
      --connect-timeout 2 --max-time 5 \
      -H "Content-Type: application/json" \
      -d "$DISPATCH_PAYLOAD" \
      -w "|%{http_code}" 2>/dev/null)
    STATUS_CODE="${RESPONSE##*|}"
    BODY="${RESPONSE%|*}"

    if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
      echo "[notify-hook] host-service dispatched status=$STATUS_CODE url=$HOOK_URL" >&2
    fi
    debug_log "host-service status=$STATUS_CODE url=$HOOK_URL body=$BODY"

    # "ignored":false means the owning host accepted and fanned out the event.
    case "$BODY" in
      *'"ignored":false'*|*'"ignored": false'*) HOOK_ACCEPTED="1"; return 0 ;;
    esac
    case "$STATUS_CODE" in
      2*) HOOK_DELIVERED_2XX="1" ;;
    esac
  done
  return 0
}

# Subagent events go to the host-service roster only: no v1 fallback, no
# session id (a Codex child's session_id is its own thread, never the
# terminal's resumable session), and the raw event name so the host can tell
# a start from a stop.
if [ -n "$SUBAGENT_ID" ]; then
  debug_log "subagent event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID subagentId=$SUBAGENT_ID subagentType=$SUBAGENT_TYPE"
  [ -n "$SUPERSET_TERMINAL_ID" ] || exit 0
  dispatch_to_host "{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"subagent\":{\"id\":\"$(json_escape "$SUBAGENT_ID")\",\"type\":\"$(json_escape "$SUBAGENT_TYPE")\",\"sessionId\":\"$(json_escape "$HOOK_SESSION_ID")\",\"transcriptPath\":\"$(json_escape "$TRANSCRIPT_PATH")\",\"agentTranscriptPath\":\"$(json_escape "$AGENT_TRANSCRIPT_PATH")\"}}}"
  exit 0
fi

debug_log "event=$EVENT_TYPE terminalId=$SUPERSET_TERMINAL_ID agentId=$SUPERSET_AGENT_ID sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID tabId=$SUPERSET_TAB_ID"

V1_EVENT_TYPE="$EVENT_TYPE"
case "$V1_EVENT_TYPE" in
  Attached|attached|SessionStart|sessionStart|session_start)
    V1_EVENT_TYPE="Start"
    ;;
  Detached|detached|SessionEnd|sessionEnd|session_end)
    V1_EVENT_TYPE="Stop"
    ;;
esac

if [ -n "$SUPERSET_TERMINAL_ID" ]; then
  dispatch_to_host "{\"json\":{\"terminalId\":\"$(json_escape "$SUPERSET_TERMINAL_ID")\",\"eventType\":\"$(json_escape "$EVENT_TYPE")\",\"agent\":{\"agentId\":\"$(json_escape "$SUPERSET_AGENT_ID")\",\"sessionId\":\"$(json_escape "$SESSION_ID")\"}}}"
  [ "$HOOK_ACCEPTED" = "1" ] && exit 0
  # Delivered somewhere (2xx) but no host owned the terminal: keep the
  # pre-existing "any 2xx wins" behavior and skip the v1 fallback.
  [ "$HOOK_DELIVERED_2XX" = "1" ] && exit 0
fi

# v1 fallback: Electron localhost hook server. Kept while v1 terminals exist.
[ -z "$SUPERSET_TAB_ID" ] && [ -z "$SESSION_ID" ] && [ -z "$SUPERSET_TERMINAL_ID" ] && exit 0

# rawEventType keeps the un-collapsed event (SessionStart/SessionEnd survive)
# so the app can tell an agent's own goodbye from a turn Stop — the v1 pane
# agent-session capture needs that to mirror v2 resume-candidate detection.
if [ "$DEBUG_HOOKS_ENABLED" = "1" ]; then
  STATUS_CODE=$(curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "terminalId=$SUPERSET_TERMINAL_ID" \
    --data-urlencode "sessionId=$SESSION_ID" \
    --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
    --data-urlencode "resourceId=$RESOURCE_ID" \
    --data-urlencode "eventType=$V1_EVENT_TYPE" \
    --data-urlencode "rawEventType=$EVENT_TYPE" \
    --data-urlencode "agentId=$SUPERSET_AGENT_ID" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    -o /dev/null -w "%{http_code}" 2>/dev/null)
  echo "[notify-hook] v1 dispatched status=$STATUS_CODE" >&2
  debug_log "v1 status=$STATUS_CODE port=${SUPERSET_PORT:-{{DEFAULT_PORT}}}"
else
  debug_log "v1 dispatch port=${SUPERSET_PORT:-{{DEFAULT_PORT}}}"
  curl -sG "http://127.0.0.1:${SUPERSET_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
    --connect-timeout 1 --max-time 2 \
    --data-urlencode "paneId=$SUPERSET_PANE_ID" \
    --data-urlencode "tabId=$SUPERSET_TAB_ID" \
    --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \
    --data-urlencode "terminalId=$SUPERSET_TERMINAL_ID" \
    --data-urlencode "sessionId=$SESSION_ID" \
    --data-urlencode "hookSessionId=$HOOK_SESSION_ID" \
    --data-urlencode "resourceId=$RESOURCE_ID" \
    --data-urlencode "eventType=$V1_EVENT_TYPE" \
    --data-urlencode "rawEventType=$EVENT_TYPE" \
    --data-urlencode "agentId=$SUPERSET_AGENT_ID" \
    --data-urlencode "env=$SUPERSET_ENV" \
    --data-urlencode "version=$SUPERSET_HOOK_VERSION" \
    > /dev/null 2>&1
fi

exit 0
