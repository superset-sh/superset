---
name: standup
description: Digest of what the user's Superset agents did while they were away, sweeping workspaces, tasks, and agent terminals to report what finished, what needs review, and what's blocked. Use when the user asks "what did my agents do", "what happened while I was away", wants a standup or summary of agent work, or returns after a break.
argument-hint: optional timeframe or project
allowed-tools: Bash(superset:*) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/sweep.sh *)
---

# Superset Standup

Answer "what happened while I was away?" from real state, not guesses. Entirely read-only.

## 1. Sweep

Run `bash scripts/sweep.sh` from this skill's directory (`bash ${CLAUDE_SKILL_DIR}/scripts/sweep.sh` in Claude Code). It lists workspaces and tasks, then for each workspace lists its terminals and reads the last screen of every agent terminal, tolerating individual failures. Pass `--host <id>` to sweep a remote host, `--max-lines <n>` to change the per-terminal tail (default 60).

If the script can't run (no bash, no `jq`), do the same by hand: `superset workspaces list --json`, `superset tasks list --json`, then per workspace `superset terminals list --workspace <id> --json` and `superset terminals read --workspace <id> --terminal <terminalId> --max-lines 60`.

The last screen of a terminal shows whether the agent finished, asked a question, or errored.

## 2. Classify each workspace

- **Needs you**: agent finished and awaits review, asked a question, or hit a permission prompt or failure
- **In flight**: actively working
- **Blocked**: waiting on something external
- **Stale**: idle with no pending work, a candidate for cleanup

## 3. Report

Lead with what needs the user, one line per item: workspace, agent, state, and the next action. Then in-flight, then completed, then stale-workspace cleanup suggestions. Keep the whole digest scannable: no terminal dumps, quote at most the single relevant line an agent printed.

## Rules

Never send input to a terminal, modify tasks, or clean anything up as part of the digest. Offer those as follow-ups and act only when asked.
