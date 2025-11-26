# Worktree Configuration

## Overview

Superset uses git worktrees to create isolated workspaces for parallel development tasks. This document describes the worktree path configuration system and migration from the legacy structure.

## Directory Structure

### New Structure (Default)

As of the worktree configuration refactoring, worktrees are stored in a centralized location:

```
~/.superset/worktrees/superset/
├── azure-cloud-42/
│   ├── setup.json           # Workspace-specific configuration
│   ├── .git                 # Git worktree metadata
│   └── <project files>
├── crimson-forest-17/
│   ├── setup.json
│   └── <project files>
└── lavender-sunset-84/
    ├── setup.json
    └── <project files>
```

**Benefits:**
- **Centralized Management**: All worktrees in one location
- **Per-Worktree Config**: Each worktree has its own `setup.json`
- **Cleaner Repos**: No `.superset/` directories in your main repository
- **Easy Cleanup**: Delete `~/.superset/worktrees/superset/` to remove all worktrees

### Legacy Structure

The old structure stored worktrees inside the main repository:

```
/Users/kietho/workplace/superset/
├── .superset/
│   ├── azure-cloud-42/      # Worktree
│   ├── crimson-forest-17/   # Worktree
│   └── lavender-sunset-84/  # Worktree
└── <main repo files>
```

## Configuration

### Environment Variables

#### `SUP_WORKTREE_ROOT`

Override the default worktree root directory.

**Default:** `~/.superset/worktrees/superset`

**Example:**
```bash
export SUP_WORKTREE_ROOT="/custom/worktree/location"
```

#### `SUP_USE_LEGACY_PATHS`

Force the app to use the legacy worktree structure (inside the main repo's `.superset/` directory).

**Default:** `false` (use new structure)

**Example:**
```bash
export SUP_USE_LEGACY_PATHS=true
```

**⚠️ Warning:** When set to `true`, the app will log warnings recommending migration to the new structure.

## Setup.json

Each worktree maintains its own `setup.json` file at the root of the worktree directory.

**Location:** `<worktree-path>/setup.json`

**Example:** `~/.superset/worktrees/superset/azure-cloud-42/setup.json`

### Sample setup.json

```json
{
  "scripts": {
    "install": "bun install",
    "build": "bun run build",
    "test": "bun test"
  },
  "env": {
    "NODE_ENV": "development",
    "API_KEY": "..."
  }
}
```

## Migration Guide

### Automatic Migration (Recommended)

The desktop app will automatically use the new structure for new worktrees. Existing worktrees in the legacy location will continue to work.

### Manual Migration

To migrate existing worktrees to the new structure:

1. **List current worktrees:**
   ```bash
   git worktree list
   ```

2. **Remove old worktree:**
   ```bash
   git worktree remove .superset/<worktree-name>
   ```

3. **Create new worktree:**
   Use the Superset app to create a new worktree (it will use the new location automatically)

4. **Copy setup.json:**
   If you had custom configuration, copy it to the new worktree:
   ```bash
   cp <old-path>/setup.json ~/.superset/worktrees/superset/<worktree-name>/
   ```

### Gradual Migration

You can migrate worktrees gradually:
- New worktrees → New structure
- Old worktrees → Keep in legacy location until ready to migrate

The app supports both structures simultaneously.

## Validation

To verify your worktree paths resolve correctly:

1. **Check environment:**
   ```bash
   echo $SUP_WORKTREE_ROOT  # Should show custom path or be empty (uses default)
   echo $SUP_USE_LEGACY_PATHS  # Should be empty or "false"
   ```

2. **Verify git worktrees:**
   ```bash
   git worktree list --porcelain
   ```

3. **Check expected paths:**
   ```bash
   ls -la ~/.superset/worktrees/superset/
   ```

## Implementation Details

### Code References

- **Configuration Module:** `apps/desktop/src/shared/config/worktree-config.ts`
- **Path Construction:** `apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts`
- **Tests:** `apps/desktop/src/shared/config/worktree-config.test.ts`

### Key Functions

```typescript
// Get the worktree root directory
getWorktreeRoot(): string

// Build path for a specific worktree
getWorktreePath(worktreeName: string): string

// Get setup.json path for a worktree
getWorktreeSetupPath(worktreeName: string): string

// Legacy path builder (for backwards compatibility)
getLegacyWorktreePath(mainRepoPath: string, worktreeName: string): string
```

## Troubleshooting

### Worktrees in unexpected location

**Problem:** Worktrees are being created in the old location

**Solution:** Check if `SUP_USE_LEGACY_PATHS` is set to `true`. Unset it or set it to `false`.

### Cannot find setup.json

**Problem:** The app can't find the worktree's `setup.json`

**Solution:**
1. Verify the file exists: `ls ~/.superset/worktrees/superset/<worktree-name>/setup.json`
2. Check the worktree path in the database matches the actual location
3. Ensure you don't have conflicting environment variables

### Migration from legacy paths

**Problem:** Want to clean up old `.superset/` directory in main repo

**Solution:**
1. Back up any important `setup.json` files
2. Remove all worktrees: Delete the app's workspaces (this removes the git worktrees)
3. Delete the directory: `rm -rf .superset/` (in your main repo)
4. Create new worktrees (they'll use the new location)

## Related Documentation

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Type-Safe IPC System](./TYPE_SAFE_IPC.md)
- [Desktop App Architecture](../README.md)
