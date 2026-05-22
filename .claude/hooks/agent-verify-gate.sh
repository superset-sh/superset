#!/usr/bin/env bash
set -euo pipefail

# Agent-only verification gate.
# Called from Claude Code Stop/SubagentStop hooks and Codex Stop hooks.
# Runs lefthook verify pipeline (tsgo + biome + fallow).
#
# Agent-only by design:
#   - Claude Code hooks only fire in Claude Code sessions
#   - Codex hooks only fire in Codex sessions
#   - This script is never on the PATH for human terminal use
#   - Belt-and-suspenders: check for known agent env vars

# Check if we're in an agent session. Both Claude Code and Codex set session IDs.
# If neither is set, skip — we're not in an agent context.
IS_AGENT=false
if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then IS_AGENT=true; fi
if [ -n "${CODEX_SESSION_ID:-}" ]; then IS_AGENT=true; fi
if [ -n "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]; then IS_AGENT=true; fi

if [ "$IS_AGENT" = "false" ]; then
  echo "agent-verify-gate: not in agent session, skipping." >&2
  exit 0
fi

# Run the verify pipeline from lefthook.yml
if ! command -v lefthook >/dev/null 2>&1; then
  echo "agent-verify-gate: lefthook not found, skipping verification." >&2
  exit 0
fi

exec lefthook run verify
