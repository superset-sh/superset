#!/bin/bash
# Read-only usage audit for the 10x skill.
# Emits one JSON object on stdout; progress and errors go to stderr.
set -u

if ! command -v superset >/dev/null 2>&1; then
  echo "superset CLI not found on PATH; install with: curl -fsSL https://superset.sh/cli/install.sh | sh" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found; run the audit commands by hand as described in SKILL.md" >&2
  exit 1
fi

# Runs a superset command and prints its JSON, or null with the error on stderr.
run_json() {
  local out
  if out=$(superset "$@" --json 2>/tmp/superset-audit-err.$$); then
    printf '%s' "$out" | jq -c '.' 2>/dev/null || echo null
  else
    echo "failed: superset $* ($(tr '\n' ' ' </tmp/superset-audit-err.$$))" >&2
    echo null
  fi
  rm -f /tmp/superset-audit-err.$$
}

echo "auditing Superset usage..." >&2
jq -n \
  --argjson whoami "$(run_json auth whoami)" \
  --argjson automations "$(run_json automations list)" \
  --argjson workspaces "$(run_json workspaces list)" \
  --argjson agents "$(run_json agents list --local)" \
  --argjson hosts "$(run_json hosts list)" \
  --argjson tasks "$(run_json tasks list --limit 20)" \
  '{whoami: $whoami, automations: $automations, workspaces: $workspaces, agents: $agents, hosts: $hosts, tasks: $tasks}'
