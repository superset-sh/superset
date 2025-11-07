# Running Multiple Dev Instances

This guide explains how to run multiple Electron instances simultaneously for parallel development.

## Quick Start

### Method 1: Automatic Port Management (Recommended)

The app automatically manages ports for you! Each instance will:
- Try to use the last used port (stored in `~/.superset/dev-port.json`)
- If that port is unavailable, automatically find the next available port in the range (4927-4999)
- Save the chosen port for next time

Simply run multiple instances:

```bash
# Terminal 1 - Instance 1
cd apps/desktop && bun dev

# Terminal 2 - Instance 2 (will automatically get next available port)
cd apps/desktop && bun dev

# Terminal 3 - Instance 3 (will automatically get next available port)
cd apps/desktop && bun dev
```

Each instance will automatically select an available port without any configuration needed.

### Method 2: Using Worktrees

When you create a new worktree via the Superset app, each worktree will automatically get its own port:

```bash
# Worktree 1 - automatically finds available port
# Worktree 2 - automatically finds available port
# Worktree 3 - automatically finds available port
```

Ports are managed automatically - no manual configuration needed!

### Windows

Ports are automatically managed on Windows too:

```powershell
# Terminal 1 - Instance 1 (automatically gets available port)
cd apps\desktop; bun dev

# Terminal 2 - Instance 2 (automatically gets next available port)
cd apps\desktop; bun dev
```

Each instance will automatically select an available port without any configuration needed.

## How It Works

Each instance runs with:
- **Separate dev server port** - Automatically selected from available ports (4927-4999), persisted in `~/.superset/dev-port.json`
- **Separate user data directory** - Each instance stores settings, cache, and local storage in `~/.superset-dev-{instance-name}` (optional)

This allows you to:
- Test different branches simultaneously
- Compare features side-by-side
- Debug without affecting your main development instance
- Test migrations and upgrades

## Manual Setup

If you want to use a custom user data directory:

```bash
# Run with custom user data directory
bun dev -- --user-data-dir="$HOME/.superset-dev-custom"
```

The port will still be automatically selected - no need to configure it manually!

## User Data Directories

Each instance stores its data in:
- **macOS/Linux**: `~/.superset-dev-{instance-name}/`
- **Windows**: `%USERPROFILE%\.superset-dev-{instance-name}\`

This includes:
- Application settings
- Local storage
- IndexedDB data
- Cache
- Workspace configurations

## Cleaning Up

To reset an instance, delete its user data directory:

```bash
# macOS/Linux
rm -rf ~/.superset-dev-instance1

# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.superset-dev-instance1"
```

## Troubleshooting

### Port already in use
The app automatically handles port conflicts by finding the next available port. If you see port-related issues:
1. The app will automatically switch to an available port
2. Check `~/.superset/dev-port.json` to see which port is being used
3. If needed, delete the config file to reset port selection

### Instances share the same data
Make sure each instance uses a different user data directory. Check that the `--user-data-dir` flag is being passed correctly.

### Changes not reflected
If code changes aren't showing up, make sure you're editing in the correct workspace and that hot reload is working in the terminal running that instance.
