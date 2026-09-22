#!/bin/bash
{{MARKER}}

INPUT=$(cat)

[ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

case "$SUPERSET_PAGES_NUDGE" in
  0|off|OFF|false|FALSE|no|NO) exit 0 ;;
esac

json_field() {
  printf '%s' "$INPUT" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | grep -oE '"[^"]*"$' | tr -d '"'
}

[ "$(json_field tool_name)" = "Artifact" ] || exit 0

case "$(json_field action)" in
  ""|publish) ;;
  *) exit 0 ;;
esac
[ -n "$(json_field url)" ] && exit 0

SESSION_KEY=$(json_field session_id)
[ -n "$SESSION_KEY" ] || SESSION_KEY="$SUPERSET_TERMINAL_ID"
SESSION_KEY=$(printf '%s' "$SESSION_KEY" | tr -cd '[:alnum:]._-')
[ -n "$SESSION_KEY" ] || exit 0

MARKER_DIR="${SUPERSET_ARTIFACT_GUARD_STATE_DIR:-${TMPDIR:-/tmp}/superset-artifact-guard}"
MARKER_FILE="$MARKER_DIR/$SESSION_KEY"
[ -f "$MARKER_FILE" ] && exit 0
mkdir -p "$MARKER_DIR" 2>/dev/null || exit 0
touch "$MARKER_FILE" 2>/dev/null || exit 0

REASON='You are in a Superset workspace, where a document a teammate will open belongs on a Superset Page rather than a Claude artifact. A page is listed in the org, every publish mints a version, and readers pin comments to it that come back to you to fix; an artifact has none of that. Read the Superset Pages skill (superset:page in the Superset plugin, or superset-page in your available skills) and publish with it. `superset pages publish <path>` works from this terminal. If the user asked for a Claude artifact by name, or no Pages skill is available, call Artifact again and it will go through.'

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
  "$(printf '%s' "$REASON" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
exit 0
