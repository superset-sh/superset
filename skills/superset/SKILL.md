---
name: superset
description: Drives the Superset CLI to orchestrate coding agents across devices. Use when the user wants to spawn an agent, create or manage workspaces, schedule automations, or interact with Superset projects, hosts, or tasks from the terminal.
allowed-tools: Bash(superset:*)
---

# Superset CLI

The `superset` command provides fast access to spawning subagents and creating copies of projects in isolated workspaces.

If the CLI is not installed, you can install it using `curl -fsSL https://superset.sh/cli/install.sh | sh`.

## Core Workflow

1. **Pick a project and host**: `superset projects list` and `superset hosts list`.
2. **Create a Workspace**: `superset workspaces create --project <id> --host <id> --name "..." --branch <branch>` (or `--pr <number>`, or `--local` instead of `--host`).
3. **Spawn an agent**: `superset agents run --workspace <id> --agent claude --prompt "..."`.
4. **Plan work**: `superset tasks create --title "..."` then `tasks update <id-or-slug>` as work progresses.

## Runtime Context

When invoked from inside a Superset workspace or terminal, these environment variables are set and can provide you with context about your session:

- `$SUPERSET_WORKSPACE_ID` — current workspace id (use directly with `agents run --workspace`, `automations create --workspace`, etc.)
- `$SUPERSET_TERMINAL_ID` — current terminal session id

If `$SUPERSET_WORKSPACE_ID` is unset, you're not inside a Superset workspace — follow the Core Workflow above to create one.

## Workspaces

```bash
superset workspaces create --project <id> --host <id> --name "..." --branch <branch>
superset workspaces create --project <id> --local --name "..." --pr <number>
superset workspaces list [--host <id> | --local]
superset workspaces delete <id> [<id>...]
```

Provide exactly one of `--branch` or `--pr`. With `--pr`, the host runs `gh pr checkout`. `--base-branch <name>` is the fork point when `--branch` doesn't exist yet.

## Agents

```bash
superset agents list --host <id>                 # Configured agents on a host (LABEL, PRESET, COMMAND, ID)
superset agents list --local                     # Same, for this machine
superset agents list --local --presets           # Available presets you could add
superset agents run --workspace <id> --agent claude --prompt "..."
```

`--agent` accepts a preset id (e.g. `claude`, `codex`) or a HostAgentConfig instance UUID. Pass `--attachment-id <uuid>` once per attachment. Use `agents list` first if you don't already know which agents are installed on the target host.

## Tasks

```bash
superset tasks list                              # List tasks in active org
superset tasks list --priority high --assignee-me
superset tasks get <id-or-slug>
superset tasks create --title "..." [--priority high]
superset tasks update <id-or-slug> --status-id <id>
superset tasks delete <id-or-slug>
```

Filter flags: `--status`, `--priority`, `--assignee`, `--assignee-me` (`-m`), `--creator-me`, `--search` (`-s`), `--limit`, `--offset`.

## Projects

```bash
superset projects list                           # NAME, SLUG, REPO, ID
```

A project is a checked-out repo. You'll need a project ID to create workspaces or schedule automations.

## Hosts

```bash
superset hosts list                              # NAME, ONLINE, ID
```

A host is a registered machine that can run workspaces. Use `--local` on workspace commands to target this machine.

## Automations (alias: `auto`)

Automations run an agent session on a schedule. Each fire dispatches to a host and produces a workspace you (or a teammate) can open and continue interactively. Two modes:

Provide one or both of `--project` or `--workspace`. Schedules are stored as [RFC 5545 RRules](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5). Runs are dispatched at-least-once — design prompts to be idempotent. If the target host is offline at fire time, the run is marked `skipped_offline` and the next occurrence schedules normally. 
If a workspace is omitted, it will create a fresh clone of a repo for the automation to run in.

```bash
superset automations list
superset automations get <id-or-slug>
superset automations create --name "..." --rrule "FREQ=DAILY;BYHOUR=9" \
  --project <id> --agent claude --prompt-file prompt.md
superset automations create --name "..." --rrule "FREQ=WEEKLY;BYDAY=MO" \
  --workspace <id> --agent claude --prompt "Inline prompt"
superset automations update <id> --name "..."
superset automations pause <id>
superset automations resume <id>
superset automations run <id>                    # One-off run
superset automations delete <id>
superset automations logs <id> [--limit N]       # Recent runs
superset automations prompt get <id>             # Print prompt to stdout
superset automations prompt set <id> --from-file prompt.md
```

`prompt get | prompt set` round-trips byte-exact, so:

```bash
superset automations prompt get <id> > prompt.md
$EDITOR prompt.md
superset automations prompt set <id> --from-file prompt.md
```

## Common Workflows

### Run an automation and inspect the result

```bash
superset automations list --json | jq '.[] | {id, name}'
superset automations run <id> --json
superset automations get <id> --json
```

## Tips

1. **Always use `--json`** when scripting or running as an agent — `--json` output is consistent per-command.
2. **`auth whoami` before anything else** — most failures trace back to an empty `organizationId` in config or an expired token.

## Troubleshooting

- **"No active organization"**: run `superset organization list && superset organization switch <id>`.
- **"Host is offline / error connecting to host"**: the host's relay tunnel is not connected. Check to make sure both the cli and the target machine are on the latest versions of Superset.
