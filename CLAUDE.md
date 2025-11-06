# Superset Monorepo Guide

Guidelines for agents and developers working in this repository.

## Structure

Bun + Turbo monorepo with:
- **Apps**:
  - `apps/website` - Main website application
  - `apps/desktop` - Electron desktop application (see [Desktop App Guide](#desktop-app-electron) below)
  - `apps/docs` - Documentation site
  - `apps/blog` - Blog site
- **Packages**:
  - `packages/ui` - Shared UI components (shadcn/ui + TailwindCSS v4)
  - `packages/db` - Drizzle ORM database schema
  - `packages/constants` - Shared constants
  - `packages/models` - Shared data models
  - `packages/scripts` - CLI tooling
  - `packages/typescript-config` - TypeScript configs

## Tech Stack

- **Package Manager**: Bun (no npm/yarn/pnpm)
- **Build System**: Turborepo
- **Database**: Drizzle ORM + PostgreSQL
- **UI**: React + TailwindCSS v4 + shadcn/ui
- **Code Quality**: Biome (formatting + linting at root)

## Common Commands

```bash
# Development
bun dev                    # Start all dev servers
bun test                   # Run tests
bun build                  # Build all packages

# Code Quality
bun run lint               # Format + lint + fix auto-fixable issues
bun run lint:check         # Check only (no changes, for CI)
bun run format             # Format code only
bun run format:check       # Check formatting only (CI)
bun run typecheck          # Type check all packages

# Database
bun run db:push            # Apply schema changes
bun run db:seed            # Seed database
bun run db:migrate         # Run migrations
bun run db:studio          # Open Drizzle Studio

# Maintenance
bun run clean              # Clean root node_modules
bun run clean:workspaces   # Clean all workspace node_modules
```

## UI Components

All components in `packages/ui`:
- **Import**: `@superset/ui/button`, `@superset/ui/input`, etc.
- **Icons**: `@superset/ui/icons`
- **Utils**: `@superset/ui/utils`
- **Hooks**: `@superset/ui/hooks`
- **Styles**: `@superset/ui/globals.css`
- **Add shadcn component**: `npx shadcn@latest add <component>` (run in `packages/ui/`)

## Code Quality

**Biome runs at root level** (not per-package) for speed:
- `biome check --write` = format + lint + organize imports + fix safe issues
- `biome check` = check only (no changes)
- `biome format` = format only
- Use `bun run lint` to fix all issues automatically

## Agent Rules

1. **Keep diffs minimal** - targeted edits only
2. **Follow existing patterns** - match the codebase style
3. **Use Bun** - not npm/yarn/pnpm
4. **Don't modify**: lockfiles, generated files, node_modules
5. **Type safety** - avoid `any` unless necessary
6. **Don't run dev servers** in automation
7. **Search narrowly** - avoid reading large files/assets

## Database Rules

- Schema in `packages/db/src/`
- Use Drizzle ORM for all database operations
- **DO NOT run `db:gen`** - reserved for maintainers

## Desktop App (Electron)

### Architecture

The desktop app uses:
- **Electron** - Main process, renderer process, preload scripts
- **IPC Communication** - Type-safe IPC system (see below)
- **Terminal Management** - node-pty for terminal sessions
- **Workspace/Worktree System** - Git worktree-based workspace management

### Type-Safe IPC System

**All IPC communication is fully type-safe.** See `apps/desktop/docs/TYPE_SAFE_IPC.md` for complete documentation.

#### Quick Reference

**1. Define channel types** in `apps/desktop/src/shared/ipc-channels.ts`:
```typescript
export interface IpcChannels {
  "my-channel": {
    request: { param1: string; param2: number };
    response: { success: boolean; data?: any };
  };
}
```

**2. Implement handler** in `apps/desktop/src/main/lib/*.ts`:
```typescript
// ✅ CORRECT: Accept object parameter
ipcMain.handle("my-channel", async (_event, input: { param1: string; param2: number }) => {
  return { success: true, data: someResult };
});

// ❌ WRONG: Don't use positional parameters
ipcMain.handle("my-channel", async (_event, param1, param2) => {
  // This won't match the typed renderer calls!
});
```

**3. Call from renderer** in `apps/desktop/src/renderer/**/*.tsx`:
```typescript
// Type-safe - no manual type assertions needed!
const result = await window.ipcRenderer.invoke("my-channel", {
  param1: "value",
  param2: 123,
});
// TypeScript knows the exact response type
```

#### IPC Rules

1. **Always use object parameters** - Handlers must accept a single object, not positional params
2. **Define types first** - Add to `ipc-channels.ts` before implementing
3. **No manual type assertions** - Let TypeScript infer types from the definitions
4. **Test after adding channels** - Verify parameters are received correctly

### File Structure

- `src/main/` - Main process (Node.js environment)
  - `lib/workspace-ipcs.ts` - Workspace/worktree IPC handlers
  - `lib/terminal-ipcs.ts` - Terminal IPC handlers
  - `lib/workspace-manager.ts` - Workspace business logic
  - `lib/worktree-manager.ts` - Git worktree operations
- `src/renderer/` - Renderer process (Browser environment)
- `src/preload/` - Preload scripts (Context bridge, type-safe IPC wrapper)
- `src/shared/` - Shared types and constants
  - `types.ts` - Data models
  - `ipc-channels.ts` - IPC type definitions

### Running Multiple Instances

You can run multiple Electron instances simultaneously for parallel development. See `apps/desktop/MULTIPLE_INSTANCES.md` for full documentation.

**Quick start:**
```bash
# Method 1: Auto-increment port when creating worktrees
# The update-port.sh script runs automatically during worktree setup
# and increments VITE_DEV_SERVER_PORT in the root .env

# Method 2: Manual port update
./update-port.sh  # Increments port in root .env
cd apps/desktop && bun dev

# Method 3: Helper scripts (override .env)
./dev-instance.sh instance2 4928
```

Each instance needs:
- **Separate dev server port** - Set via `VITE_DEV_SERVER_PORT` in root `.env`
- **Separate user data directory** - Pass via `--user-data-dir` flag

The desktop app loads environment variables from the monorepo root `.env` file.

### Keyboard Shortcuts System

The desktop app uses a centralized keyboard shortcuts system inspired by Arc Browser.

**File Structure:**
- `src/renderer/lib/keyboard-shortcuts.ts` - Core shortcuts infrastructure (types, matchers, handlers)
- `src/renderer/lib/shortcuts.ts` - Arc-style shortcut definitions (workspace, tab, terminal)

**Implemented Shortcuts:**

**Workspace Management:**
- `Cmd+Option+Left/Right` - Switch between workspaces
- `Cmd+S` - Toggle sidebar visibility
- `Cmd+D` - Create split view (horizontal)
- `Cmd+Shift+D` - Create split view (vertical)

**Tab Management:**
- `Cmd+Option+Up/Down` - Switch between tabs
- `Cmd+T` - Create new tab
- `Cmd+W` - Close tab
- `Cmd+Shift+T` - Reopen closed tab [TODO - requires history tracking]
- `Cmd+1-9` - Jump to tab by position

**Terminal:**
- `Cmd+K` - Clear terminal (scrollback + screen)

**Adding New Shortcuts:**

1. Define handlers in the component (e.g., `MainScreen.tsx`)
2. Create shortcut group using helper functions from `shortcuts.ts`
3. Use `createShortcutHandler` to convert to event handler
4. Attach to event listener or terminal custom key handler

**Example:**
```typescript
const shortcuts = createWorkspaceShortcuts({
  switchToPrevWorkspace: () => { /* handler logic */ },
  // ... other handlers
});

const handleKeyDown = createShortcutHandler(shortcuts.shortcuts);
window.addEventListener("keydown", handleKeyDown);
```
