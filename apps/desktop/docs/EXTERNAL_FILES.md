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
| `claude` | Wrapper for Claude Code CLI that injects notification hooks |
| `codex` | Wrapper for Codex CLI that injects notification hooks |
| `opencode` | Wrapper for OpenCode CLI that resolves real binary |

These wrappers are added to `PATH` via shell integration, allowing them to intercept
agent commands and inject Superset-specific configuration.

### `hooks/` - Notification Hook Scripts

| File | Purpose |
|------|---------|
| `notify.sh` | Shell script called by agents when they complete or need input |
| `claude-settings.json` | Claude Code settings file with hook configuration |

### `zsh/` and `bash/` - Shell Integration

| File | Purpose |
|------|---------|
| `init.zsh` | Zsh initialization script (sources .zshrc, sets up PATH) |
| `init.bash` | Bash initialization script (sources .bashrc, sets up PATH) |

## Global Files

| File | Purpose |
|------|---------|
| `~/.config/opencode/plugin/superset-notify.js` | OpenCode plugin for lifecycle events |

The OpenCode plugin is installed at the global path so it doesn't interfere with user's
OpenCode config (commands, skills, agents). The plugin reads `SUPERSET_NOTIFY_PATH` from
the terminal environment at runtime, so the file content is identical across dev/prod — no
conflicts when both are running.

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
| `SUPERSET_NOTIFY_PATH` | Path to the notification script for agent plugins |

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
3. Verify `SUPERSET_NOTIFY_PATH` is set correctly in terminal
4. Restart both dev and prod apps to regenerate hooks
