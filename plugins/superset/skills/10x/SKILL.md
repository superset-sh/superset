---
name: 10x
description: Personalized audit that teaches advanced Superset features the user isn't using yet — automations, parallel agents, tasks, multi-host, terminals, custom commands, MCP. Use when the user wants to get more out of Superset, learn advanced Superset features, or 10x their Superset workflow.
argument-hint: optional topic, e.g. automations
---

# Superset 10x

Teach the user the advanced Superset features they aren't using yet — grounded in their real usage, not a lecture. If they named a topic after the command, skip the audit and go straight to that topic.

## 1. Audit (read-only)

Run in parallel and tolerate individual failures (prefer `--json` where supported):

- `superset auth whoami`
- `superset automations list`
- `superset workspaces list`
- `superset agents list`
- `superset hosts list`
- `superset tasks list`

If the CLI is missing, offer to install it: `curl -fsSL https://superset.sh/cli/install.sh | sh`. If unauthenticated, `superset auth login`. If the audit is impossible, ask the user what their current workflow looks like and proceed from their answer.

## 2. Scorecard

Compare their usage against the catalog below and present a short scorecard: the 3-5 highest-impact features they aren't using, one line each on the payoff. No walls of text.

## 3. Walk through one at a time

For each recommendation in order: a two-sentence pitch, then ask (use the ask_user tool if available) with options **Set it up now** / **Tell me more** / **Skip**. "Set it up now" means actually doing it — create the real automation, spawn the real workspace — after confirming the specifics (name, schedule, prompt) with the user. Never print instructions as a substitute for doing it.

## Catalog

| Feature | Why it 10x's you | Live setup |
| --- | --- | --- |
| Automations | Scheduled agents — triage, changelogs, standups run while you sleep | `superset automations create`, then `superset automations logs` to review runs |
| Parallel workspaces | Every task gets an isolated worktree; run several agents at once instead of queueing | `superset workspaces create --project <id>` then `superset agents create --workspace <id> --agent claude --prompt "..."` |
| PR review workspaces | Check out any PR into its own workspace in one command | `superset workspaces create --pr <number>` |
| Tasks | A shared queue agents can pick up; track work across sessions | `superset tasks create --title "..."`, `superset tasks update` |
| Multi-host | Run agents on your desktop from your laptop; wake offline machines | `superset hosts list`, `superset hosts set-wake`, `superset hosts wake <id>` |
| Terminal remote-control | Read and drive any agent's terminal from anywhere | `superset terminals list / read / send` |
| Custom slash commands | Your repo's own workflows as commands every agent can run | create `.agents/commands/<name>.md` in their repo |
| MCP servers | Give every workspace agent the same extra tools | add servers to `.mcp.json` at their repo root |
| Feedback loop | Report bugs or ideas without leaving the agent | invoke the `feedback` skill from this plugin |

## Rules

- The audit is read-only; never create, modify, or delete anything before the user picks "Set it up now" and confirms the specifics.
- One feature at a time; keep each step short and end it with the ask.
- Close with a one-line recap of what was set up and what they skipped, so they can come back and re-invoke this skill with a topic later.
