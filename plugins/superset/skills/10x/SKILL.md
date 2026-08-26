---
name: 10x
description: Personalized audit that teaches the advanced Superset features the user isn't using yet (automations, parallel agents, tasks, multi-host, terminal remote control, custom commands, MCP) and sets them up live. Use when the user wants to get more out of Superset, asks "what else can Superset do", "how do I 10x my workflow", "what am I missing", or wants to learn a specific Superset feature.
argument-hint: optional topic, e.g. automations
allowed-tools: Bash(superset:*) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh *)
---

# Superset 10x

Teach the user the advanced Superset features they aren't using yet, grounded in their real usage rather than a lecture. If they named a topic after the command, skip the audit and go straight to that topic.

## 1. Audit (read-only)

Run `bash scripts/audit.sh` from this skill's directory (`bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh` in Claude Code). It runs `superset auth whoami`, `automations list`, `workspaces list`, `agents list --local`, `hosts list`, and `tasks list` with `--json`, tolerating individual failures, and prints one JSON object.

If the CLI is missing, offer to install it: `curl -fsSL https://superset.sh/cli/install.sh | sh`. If unauthenticated, `superset auth login`. If the audit is impossible, ask the user what their current workflow looks like and proceed from their answer.

## 2. Scorecard

Compare their usage against the catalog below and present a short scorecard: the 3-5 highest-impact features they aren't using, one line each on the payoff. No walls of text.

## 3. Walk through one at a time

For each recommendation in order: a two-sentence pitch, then ask (use the ask_user tool if available) with options **Set it up now** / **Tell me more** / **Skip**. "Set it up now" means actually doing it, creating the real automation or spawning the real workspace, after confirming the specifics (name, schedule, prompt) with the user. Never print instructions as a substitute for doing it.

## Catalog

| Feature | Why it 10x's you | Live setup |
| --- | --- | --- |
| Automations | Scheduled agents: triage, changelogs, standups run while you sleep | `superset automations create`, then `superset automations logs` to review runs |
| Parallel workspaces | Every task gets an isolated worktree; run several agents at once instead of queueing | `superset workspaces create --project <id>` then `superset agents create --workspace <id> --agent claude --prompt "..."` |
| PR review workspaces | Check out any PR into its own workspace in one command | `superset workspaces create --pr <number>` |
| Tasks | A shared queue agents can pick up; track work across sessions | `superset tasks create --title "..."`, `superset tasks update` |
| Multi-host | Run agents on your desktop from your laptop; wake offline machines | `superset hosts list`, `superset hosts set-wake`, `superset hosts wake <id>` |
| Terminal remote-control | Read and drive any agent's terminal from anywhere | `superset terminals list / read / send` |
| Custom slash commands | Your repo's own workflows as commands every agent can run | create `.agents/commands/<name>.md` in their repo |
| MCP servers | Give every workspace agent the same extra tools | add servers to `.mcp.json` at their repo root |
| Feedback loop | Report bugs or ideas without leaving the agent | the feedback skill |

## Rules

- The audit is read-only; never create, modify, or delete anything before the user picks "Set it up now" and confirms the specifics.
- One feature at a time; keep each step short and end it with the ask.
- Close with a one-line recap of what was set up and what they skipped, so they can come back and re-invoke this skill with a topic later.
