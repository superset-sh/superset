#!/bin/bash
# Read-only sweep of Superset state for the standup skill.
# Emits one JSON object on stdout; progress and errors go to stderr.
# Usage: sweep.sh [--host <id>] [--max-lines <n>]
set -u

HOST_ARGS=()
MAX_LINES=60
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST_ARGS=(--host "$2"); shift 2 ;;
    --max-lines) MAX_LINES="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v superset >/dev/null 2>&1; then
  echo "superset CLI not found on PATH; install with: curl -fsSL https://superset.sh/cli/install.sh | sh" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; run the sweep by hand as described in SKILL.md" >&2
  exit 1
fi

# Runs a superset command and prints its JSON, or null with the error on stderr.
run_json() {
  local out
  if out=$(superset "$@" --json 2>/tmp/superset-sweep-err.$$); then
    printf '%s' "$out" | jq -c '.' 2>/dev/null || echo null
  else
    echo "failed: superset $* ($(tr '\n' ' ' </tmp/superset-sweep-err.$$))" >&2
    echo null
  fi
  rm -f /tmp/superset-sweep-err.$$
}

echo "sweeping workspaces and tasks..." >&2
WORKSPACES=$(run_json workspaces list "${HOST_ARGS[@]}")
TASKS=$(run_json tasks list --limit 20)

TERMINALS='[]'
for ws in $(printf '%s' "$WORKSPACES" | jq -r '.[]?.id // empty'); do
  echo "reading terminals in $ws..." >&2
  LIST=$(run_json terminals list --workspace "$ws" "${HOST_ARGS[@]}")
  for term in $(printf '%s' "$LIST" | jq -r '.sessions[]? | select(.exited != true) | .terminalId // empty'); do
    READ=$(run_json terminals read --workspace "$ws" --terminal "$term" --max-lines "$MAX_LINES" "${HOST_ARGS[@]}")
    ENTRY=$(printf '%s' "$LIST" | jq -c --arg ws "$ws" --arg id "$term" --argjson read "$READ" \
      '.sessions[] | select(.terminalId == $id) | {workspaceId: $ws, terminalId: .terminalId, title: .title, attached: .attached, text: ($read.text // null)}')
    TERMINALS=$(printf '%s' "$TERMINALS" | jq -c --argjson e "$ENTRY" '. + [$e]')
  done
done

jq -n --argjson workspaces "$WORKSPACES" --argjson tasks "$TASKS" --argjson terminals "$TERMINALS" \
  '{workspaces: $workspaces, tasks: $tasks, terminals: $terminals}'
