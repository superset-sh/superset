---
name: standup
description: Digest of what your Superset agents did — sweeps workspaces, tasks, and agent terminals, then reports what finished, what needs review, and what's blocked. Use when the user asks what their agents did, wants a standup or summary of agent work, or returns after being away.
argument-hint: optional timeframe or project
---

# Superset Standup

Answer "what happened while I was away?" from real state, not guesses. Entirely read-only.

## 1. Sweep (parallel, prefer --json)

- `superset workspaces list` — active workspaces
- `superset tasks list` — task states
- Per active workspace: `superset terminals list --workspace <id>`, then `superset terminals read --workspace <id> --terminal <terminalId>` for each agent terminal — the last screen of output shows whether the agent finished, asked a question, or errored

## 2. Classify each workspace

- **Needs you**: agent finished and awaits review, asked a question, or hit a permission prompt / failure
- **In flight**: actively working
- **Blocked**: waiting on something external
- **Stale**: idle with no pending work — candidate for cleanup

## 3. Report

Lead with what needs the user, one line per item: workspace, agent, state, and the next action. Then in-flight, then completed, then stale-workspace cleanup suggestions. Keep the whole digest scannable — no terminal dumps; quote at most the single relevant line an agent printed.

## Rules

Never send input to a terminal, modify tasks, or clean anything up as part of the digest — offer those as follow-ups and act only when asked.
