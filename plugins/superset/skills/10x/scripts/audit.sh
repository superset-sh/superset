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
# stdout goes to a file, not a pipe: the CLI can drop output past ~64KB when it
# exits before a slow pipe reader drains it.
run_json() {
  local out err
  out=$(mktemp) || { echo null; return; }
  err=$(mktemp) || { rm -f "$out"; echo null; return; }
  if superset "$@" --json >"$out" 2>"$err"; then
    if ! jq -c '.' "$out" 2>/dev/null; then
      echo "invalid JSON from: superset $*" >&2
      echo null
    fi
  else
    echo "failed: superset $* ($(tr '\n' ' ' <"$err"))" >&2
    echo null
  fi
  rm -f "$out" "$err"
}

echo "auditing Superset usage..." >&2
jq -n \
  --argjson whoami "$(run_json auth whoami)" \
  --argjson automations "$(run_json automations list)" \
  --argjson workspaces "$(run_json workspaces list)" \
  --argjson agents "$(run_json agents list --local)" \
  --argjson hosts "$(run_json hosts list)" \
  --argjson tasks "$(run_json tasks list)" \
  '{whoami: $whoami, automations: $automations, workspaces: $workspaces, agents: $agents, hosts: $hosts, tasks: $tasks}'
