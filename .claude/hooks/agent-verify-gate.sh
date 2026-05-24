#!/usr/bin/env bash
set -euo pipefail

# Agent-only verification gate.
# Called from Claude Code Stop/SubagentStop hooks and Codex Stop hooks.
# Runs tsgo + biome + fallow on changed files only.
#
# Agent-only by design:
#   - Claude Code / Codex hooks only fire in agent sessions
#   - Belt-and-suspenders: check env vars or stdin for agent context

# Check if we're in an agent session
IS_AGENT=false
[ -n "${CLAUDE_CODE_SESSION_ID:-}" ] && IS_AGENT=true
[ -n "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ] && IS_AGENT=true

# Codex doesn't set an env var, but its hooks receive JSON on stdin with session_id.
# If we got stdin with a session_id field, we're in an agent session.
if [ "$IS_AGENT" = "false" ] && [ -p /dev/stdin ]; then
  STDIN_DATA=$(cat 2>/dev/null || true)
  if echo "$STDIN_DATA" | jq -e '.session_id' >/dev/null 2>&1; then
    IS_AGENT=true
  fi
fi

if [ "$IS_AGENT" = "false" ]; then
  echo "agent-verify-gate: not in agent session, skipping." >&2
  exit 0
fi

FAILED=()
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Resolve binaries directly — no npx overhead
TSGO="$PROJECT_ROOT/node_modules/.bin/tsgo"
BIOME="$PROJECT_ROOT/node_modules/.bin/biome"
FALLOW="$PROJECT_ROOT/node_modules/.bin/fallow"

# --- tsgo typecheck on changed packages ---
if [ -x "$TSGO" ]; then
  CHANGED_TS=$(git diff --name-only --diff-filter=ACM main...HEAD -- '*.ts' '*.tsx' 2>/dev/null | head -50 || true)
  if [ -n "$CHANGED_TS" ]; then
    PACKAGES=$(echo "$CHANGED_TS" | grep -oP '^\K(apps/[^/]+|packages/[^/]+)' | sort -u)
    for pkg in $PACKAGES; do
      if [ -f "$PROJECT_ROOT/$pkg/tsconfig.json" ]; then
        if ! "$TSGO" --noEmit -p "$PROJECT_ROOT/$pkg/tsconfig.json" 2>&1; then
          FAILED+=("tsgo: type errors in $pkg")
        fi
      fi
    done
  fi
fi

# --- biome check on changed files ---
if [ -x "$BIOME" ]; then
  CHANGED_ALL=$(git diff --name-only --diff-filter=ACM main...HEAD 2>/dev/null | head -50 || true)
  if [ -n "$CHANGED_ALL" ]; then
    BIOME_FILES=$(echo "$CHANGED_ALL" | grep -E '\.(ts|tsx|js|jsx|json)$' || true)
    if [ -n "$BIOME_FILES" ]; then
      if ! "$BIOME" check $BIOME_FILES 2>&1; then
        FAILED+=("biome: lint/format issues in changed files")
      fi
    fi
  fi
fi

# --- fallow audit on changed files ---
if [ -x "$FALLOW" ]; then
  if ! "$FALLOW" audit --format json --quiet 2>/dev/null | jq -e '.verdict == "pass"' >/dev/null 2>&1; then
    FAILED+=("fallow: audit verdict not pass")
  fi
fi

# --- Report ---
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "agent-verify-gate: ${#FAILED[@]} check(s) failed:" >&2
  for f in "${FAILED[@]}"; do
    echo "  ✗ $f" >&2
  done
  exit 2
fi

exit 0
