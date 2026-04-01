# External Files Written by Superset Desktop

This document lists all files written by the Superset desktop app outside of user projects.
Understanding these files is critical for maintaining workspace isolation and avoiding conflicts.

## Workspace-Specific Directories

The app uses different home directories based on workspace:
- **Default**: `~/.superset/`
- **Named workspace**: `~/.superset-{workspace}/` (e.g. `~/.superset-my-feature/`)

This separation prevents multiple instances from interfering with each other.

## Files in `~/.superset[-{workspace}]/`

### `bin/` - Agent Wrapper Scripts

| File | Purpose |
|------|---------|
| `amp` | Wrapper for Amp CLI that preserves Superset terminal context |
| `claude` | Wrapper for Claude Code CLI that injects notification hooks |
| `codex` | Wrapper for Codex CLI that injects notification hooks |
| `droid` | Wrapper for Factory Droid CLI that preserves Superset hook integration |
| `opencode` | Wrapper for OpenCode CLI that sets `OPENCODE_CONFIG_DIR` |

These wrappers are added to `PATH` via shell integration, allowing them to intercept
agent commands and inject Superset-specific configuration.

### `hooks/` - Notification Hook Scripts

| File | Purpose |
|------|---------|
| `notify.sh` | Shell script called by agents when they complete or need input |
| `claude-settings.json` | Claude Code settings file with hook configuration |
| `opencode/plugin/superset-notify.js` | OpenCode plugin for lifecycle events |

## Global Tool Settings Files

Some CLIs only support global user settings for hook registration. Superset merges
its hook entries into these files while preserving user-defined entries:

| File | Purpose |
|------|---------|
| `~/.claude/settings.json` | Claude Code hook registration merge |
| `~/.codex/hooks.json` | Codex hook registration merge (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`) |
| `~/.factory/settings.json` | Factory Droid hook registration (`UserPromptSubmit`, `Notification`, `PostToolUse`, `Stop`) |

For Codex specifically, Superset now relies on native `~/.codex/hooks.json`
registration for durable prompt/tool lifecycle events, while the wrapper in
`~/.superset[-{workspace}]/bin/codex` still injects `notify` and keeps the
session-log watcher as a best-effort compatibility bridge for older Codex
releases. On startup, Superset rewrites only its own managed entries in
`~/.codex/hooks.json` to point at the current environment's `notify.sh`, while
preserving any user-defined Codex hooks.

### `zsh/` and `bash/` - Shell Integration

| File | Purpose |
|------|---------|
| `init.zsh` | Zsh initialization script (sources .zshrc, sets up PATH) |
| `init.bash` | Bash initialization script (sources .bashrc, sets up PATH) |

Shell integration keeps interactive startup close to native shell behavior:
- Interactive startup applies idempotent PATH prepend only (no persistent command interception functions).
- App-owned non-interactive `-c` command execution still routes managed binaries through absolute Superset wrapper paths.

## Global Files (AVOID ADDING NEW ONES)

**DO NOT write to global locations** like `~/.config/`, `~/Library/`, etc.
These cause dev/prod conflicts when both environments are running.

### Known Issues with Global Files

Previously, the OpenCode plugin was written to `~/.config/opencode/plugin/superset-notify.js`.
This caused severe issues:
1. Dev would overwrite prod's plugin with incompatible protocol
2. Prod terminals would send events that dev's server couldn't handle
3. Users received spam notifications for every agent message

**Solution**: The global plugin is no longer written. On startup, any stale global plugin
with our marker is deleted to prevent conflicts from older versions.

## Shell RC File Modifications

The app modifies shell RC files to add the Superset bin directory to PATH:

| Shell | RC File | Modification |
|-------|---------|--------------|
| Zsh | `~/.zshrc` | Prepends `~/.superset[-{workspace}]/bin` to PATH |
| Bash | `~/.bashrc` | Prepends `~/.superset[-{workspace}]/bin` to PATH |

## Terminal Environment Variables

Each terminal session receives these environment variables:

| Variable | Purpose |
|----------|---------|
| `SUPERSET_PANE_ID` | Unique identifier for the terminal pane |
| `SUPERSET_TAB_ID` | Identifier for the containing tab |
| `SUPERSET_WORKSPACE_ID` | Identifier for the workspace |
| `SUPERSET_WORKSPACE_NAME` | Human-readable workspace name |
| `SUPERSET_WORKSPACE_PATH` | Filesystem path to the workspace |
| `SUPERSET_ROOT_PATH` | Root path of the project |
| `SUPERSET_PORT` | Port for the notification server |
| `SUPERSET_ENV` | Environment (`development` or `production`) |
| `SUPERSET_HOOK_VERSION` | Hook protocol version for compatibility |

## Adding New External Files

Before adding new files outside of `~/.superset[-{workspace}]/`:

1. **Consider if it's necessary** - Can you use the environment-specific directory instead?
2. **Check for conflicts** - Will dev and prod overwrite each other?
3. **Update this document** - Add the file to the appropriate section
4. **Add cleanup logic** - If migrating from global to local, clean up the old location

## Debugging Cross-Environment Issues

If you suspect dev/prod cross-talk:

1. Check logs for "Environment mismatch" warnings
2. Verify `SUPERSET_ENV` and `SUPERSET_PORT` are set correctly in terminal
3. Delete stale global files: `rm -rf ~/.config/opencode/plugin/superset-notify.js`
4. Restart both dev and prod apps to regenerate hooks
