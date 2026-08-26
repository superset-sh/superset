---
name: automate
description: Turn a recurring chore into a Superset automation. Drafts the agent prompt, confirms schedule and target, creates it with the CLI, and reviews the first run together. Use when the user wants a scheduled or recurring agent, a daily or weekly job, or says things like "every morning do X", "automate this", "set up a cron agent", "run this on a schedule".
argument-hint: describe the recurring task
allowed-tools: Bash(superset:*)
---

# Superset Automate

Turn "I keep doing X every morning" into an automation that does X on a schedule.

## 1. Understand the chore

Pin down: the outcome, the cadence, the inputs it reads, and what "done" looks like. Then draft the automation prompt as instructions for an agent with zero context. If the task has rules that will evolve (triage criteria, formats), put them in a document the automation reads at runtime so they can be edited without touching the prompt.

## 2. Pick the target

- `superset projects list`: a project target creates a fresh workspace per run (most tasks)
- `superset workspaces list`: a workspace target reuses the same workspace every run (stateful tasks)

## 3. Confirm before creating

Show the user (use the ask_user tool if available): the name, the schedule as an RRULE, the agent, the target, and the exact command you will run. Never create without explicit confirmation.

## 4. Create and shake down

```bash
superset automations create \
  --name "Daily issue triage" \
  --rrule "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" \
  --timezone America/Los_Angeles \
  --project <id> \
  --agent claude \
  --prompt-file /tmp/automation-prompt.md
```

(`--workspace <id>` instead of `--project` for reuse mode; `--host <id>` if it should run on another machine; prefer `--prompt-file` for multiline prompts.)

Then trigger a first run now with `superset automations run <id>`, review `superset automations logs <id>` with the user, and refine the prompt via `superset automations prompt set <id>` until the run output is right. An automation isn't done until one real run looked good.
