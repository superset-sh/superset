# Superset CLI

CLI for managing environments, workspaces (git worktrees/cloud branches), agents, and changes. Built with Ink + Commander, storage via lowdb JSON.

## Quick start (dev)
- Install deps: `bun install`
- Dev watch: `bun dev` (builds to `dist/`)
- Run CLI from source: `bunx ts-node src/cli.tsx --help`  
  Or from build: `bun run build && bun start …`
- Binary name: `superset` (points to `dist/cli.js`)

## Core concepts
- **Environment**: grouping for workspaces (default env seeded).
- **Workspace**: local or cloud. For local, include `--path`; for cloud, include `--branch`. Tracks `defaultAgents`, `lastUsedAt`, `current workspace` pointer.
- **Worktree**: modelled as a workspace in CLI (one repo path/branch per workspace; dedicated worktree creation helpers are TODO).
- **Agent**: tmux-backed interactive session (Claude/Codex/Cursor). Each agent has a `sessionName`; `agent start` launches tmux sessions, `agent attach`/dashboard Enter attaches; detach with `Ctrl-b d`.
- **Change**: change log per workspace; has file diffs.

## Common commands
- `superset init` – Wizard to create workspace (local/cloud), set name/path/branch, choose default agents, set current workspace.
- `superset dashboard` – Ink dashboard; shows workspaces/agents, press Enter on an agent to attach to its tmux session; use `q/ESC` to exit.
- `superset workspace list|get|create|delete|use`  
  - Local: `workspace create <envId> local --path <path>`  
  - Cloud: `workspace create <envId> cloud --branch <ref>`
  - `workspace use <id>` sets current workspace.
- `superset env list|get|create|delete`
- `superset agent start [workspaceId]` – Uses current workspace if omitted; starts default agents if configured.
- `superset agent attach <agentId|sessionName>` – Attach to tmux session. Detach with `Ctrl-b d`.
- `superset agent list|get|stop <id>|stop-all [--workspace <id>]|delete <id>` – `stop-all` only stops agents and kills their tmux sessions.
- `superset change list <workspaceId>|create <workspaceId> "<summary>"|delete <id>`

## tmux integration
- Requires `tmux` installed and on PATH.
- Sessions are named `agent-<shortId>` unless overridden in storage.
- Launch commands resolve from agent `launchCommand`, env overrides `SUPERSET_AGENT_LAUNCH_<TYPE>`, or defaults (`claude`, `codex`, `cursor`).
  - To customize: `export SUPERSET_AGENT_LAUNCH_CLAUDE="your-custom-command"` (similarly for `CODEX`, `CURSOR`)
  - Ensure the command stays alive (doesn't exit immediately) to prevent tmux session failures.
- If a session exists, attach; otherwise create detached then attach. Detach with `Ctrl-b d` to return to the dashboard/CLI; agents continue running.
- `stop/stop-all` issue `tmux kill-session` and mark agent stopped.

## Storage
- lowdb JSON at `~/.superset/cli/db.json` (default), seeded with a `default` environment and `state.currentWorkspaceId`.
- Can be overridden with `SUPERSET_CLI_DATA_DIR` environment variable.
- Dates are serialized ISO strings; orchestrators backfill defaults and persist missing fields (status, launchCommand, sessionName, timestamps).

## Security & Configuration Notes

### Session Names
- Session names are generated internally as `agent-<shortId>` (6-char UUID prefix).
- Only alphanumeric, hyphen, and underscore characters are allowed in tmux session names.
- If custom session names are added in the future, they will be sanitized to meet tmux requirements.

### Launch Commands
- Agent launch commands are executed exactly as provided in environment variables or config.
- **Security**: Only use trusted commands. The CLI does not sanitize or escape launch commands.
- **Best practice**: Use binaries on PATH (e.g., `claude`, `codex`) rather than complex shell expressions.
- **Complex shells**: For wrapped commands or environment setup, set `SUPERSET_AGENT_LAUNCH_<TYPE>` to point to a single, well-known entrypoint script:
  ```bash
  export SUPERSET_AGENT_LAUNCH_CLAUDE="/usr/local/bin/launch-claude.sh"
  ```
  Then put your complex logic in that script.
- **Command validation**: Simple commands (1-2 words) are checked for existence on PATH. Complex commands (with quotes, env vars, or multiple arguments) skip preflight validation to avoid false negatives.

## Tips
- Use `superset` (no args) for a welcome summary and quick commands.
- If attach fails, ensure tmux is installed and the agent has a valid `launchCommand` (set env `SUPERSET_AGENT_LAUNCH_CLAUDE=claude` etc.).
