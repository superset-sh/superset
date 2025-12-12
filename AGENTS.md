# Superset Monorepo Guide

Guidelines for agents and developers working in this repository.

## Structure

Bun + Turbo monorepo with:
- **Apps**:
  - `apps/web` - Main web application (app.superset.sh)
  - `apps/marketing` - Marketing site (superset.sh)
  - `apps/admin` - Admin dashboard
  - `apps/api` - API backend
  - `apps/desktop` - Electron desktop application (see [Desktop App Guide](#desktop-app-electron) below)
  - `apps/docs` - Documentation site
- **Packages**:
  - `packages/ui` - Shared UI components (shadcn/ui + TailwindCSS v4).
    - Add components: `npx shadcn@latest add <component>` (run in `packages/ui/`)
  - `packages/db` - Drizzle ORM database schema
  - `packages/constants` - Shared constants
  - `packages/scripts` - CLI tooling
  - `packages/typescript-config` - TypeScript configs

## Tech Stack

- **Package Manager**: Bun (no npm/yarn/pnpm)
- **Build System**: Turborepo
- **Database**: Drizzle ORM + Neon PostgreSQL
- **UI**: React + TailwindCSS v4 + shadcn/ui
- **Code Quality**: Biome (formatting + linting at root)

## Common Commands

```bash
# Development
bun dev                    # Start all dev servers
bun test                   # Run tests
bun build                  # Build all packages

# Code Quality
bun run lint               # Check for lint issues (no changes)
bun run lint:fix           # Fix auto-fixable lint issues
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

## Code Quality

**Biome runs at root level** (not per-package) for speed:
- `biome check --write` = format + lint + organize imports + fix safe issues
- `biome check` = check only (no changes)
- `biome format` = format only
- Use `bun run lint:fix` to fix all issues automatically

## Agent Rules

1. **Keep diffs minimal** - targeted edits only
2. **Follow existing patterns** - match the codebase style
3. **Type safety** - avoid `any` unless necessary
4. **Don't run dev servers** in automation
5. **Search narrowly** - avoid reading large files/assets

## Project Structure

All projects in this repo should be structured like this:

```
app/
├── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── components/
│   │   └── MetricsChart/
│   │       ├── MetricsChart.tsx
│   │       ├── MetricsChart.test.tsx      # Tests co-located
│   │       ├── index.ts
│   │       └── constants.ts
│   ├── hooks/                             # Hooks used only in dashboard
│   │   └── useMetrics/
│   │       ├── useMetrics.ts
│   │       ├── useMetrics.test.ts
│   │       └── index.ts
│   ├── utils/                             # Utils used only in dashboard
│   │   └── formatData/
│   │       ├── formatData.ts
│   │       ├── formatData.test.ts
│   │       └── index.ts
│   ├── stores/                            # Stores used only in dashboard
│   │   └── dashboardStore/
│   │       ├── dashboardStore.ts
│   │       └── index.ts
│   └── providers/                         # Providers for dashboard context
│       └── DashboardProvider/
│           ├── DashboardProvider.tsx
│           └── index.ts
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx
    │   ├── Sidebar.test.tsx               # Tests co-located
    │   ├── index.ts
    │   ├── components/                    # Used 2+ times IN Sidebar
    │   │   └── SidebarButton/             # Shared by SidebarNav + SidebarFooter
    │   │       ├── SidebarButton.tsx
    │   │       ├── SidebarButton.test.tsx
    │   │       └── index.ts
    │   ├── SidebarNav/
    │   │   ├── SidebarNav.tsx
    │   │   └── index.ts
    │   └── SidebarFooter/
    │       ├── SidebarFooter.tsx
    │       └── index.ts
    └── HeroSection/
        ├── HeroSection.tsx
        ├── HeroSection.test.tsx           # Tests co-located
        ├── index.ts
        └── components/                    # Used ONLY by HeroSection
            └── HeroCanvas/
                ├── HeroCanvas.tsx
                ├── HeroCanvas.test.tsx
                ├── HeroCanvas.stories.tsx
                ├── index.ts
                └── config.ts

components/                                # Used in 2+ pages (last resort)
└── Header/
```

1. **One folder per component**: `ComponentName/ComponentName.tsx` + `index.ts` for barrel export
2. **Co-locate by usage**: If used once, nest under parent's `components/`. If used 2+ times, promote to **highest shared parent's** `components/` (or `components/` as last resort)
3. **One component per file**: No multi-component files
4. **Co-locate dependencies**: Utils, hooks, constants, config, tests, stories live next to the file using them

### Exception: shadcn/ui Components

The `src/components/ui/`, `src/components/ai-elements`, and `src/components/react-flow/` directories contain shadcn/ui components. These use **kebab-case single files** (e.g., `button.tsx`, `base-node.tsx`) instead of the folder structure above. This is intentional—shadcn CLI expects this format for updates via `bunx shadcn@latest add`.

## Database Rules

- Schema in `packages/db/src/`
- Use Drizzle ORM for all database operations

## DB migrations
- Always spin up a new neon branch to create migrations. Update our root .env files to point at the neon branch locally.
- Use drizzle to manage the migration. You can see the schema at packages/db/src/schema. Never run a migration yourself.
- Create migrations by changing drizzle schema then running `pnpm drizzle-kit generate --name="<sample_name_snake_case>"`
- `NEON_ORG_ID` and `NEON_PROJECT_ID` env vars are set in .env
- list_projects tool requires org_id passed in

## Desktop App (Electron)

### Architecture

The desktop app uses:
- **Electron** - Main process, renderer process, preload scripts
- **IPC Communication** - Type-safe IPC system (see below)
- **Terminal Management** - node-pty for terminal sessions
- **Workspace/Worktree System** - Git worktree-based workspace management

### Critical Architecture Rules

**⚠️ NEVER import Node.js modules in renderer or shared code!**

1. **Main process** (`src/main/`): Can use Node.js modules (fs, path, os, net, etc.)
2. **Renderer process** (`src/renderer/`): Cannot use Node.js modules - browser environment only
3. **Shared code** (`src/lib/electron-router-dom.ts` and similar): Cannot use Node.js modules

**Why?** Vite externalizes Node.js modules for browser compatibility. Importing them in renderer code causes:
```
Uncaught Error: Module "node:fs" has been externalized for browser compatibility
```

**How to check:** Run `bun run lint:check-node-imports` to detect violations automatically.
This check runs as part of `bun run typecheck`.

**If you need Node.js functionality in renderer:**
- Move the code to `src/main/lib/`
- Use IPC to communicate between renderer and main process
- Pass data through preload script or environment variables

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

### Environment Variable Loading

The desktop app loads environment variables from the monorepo root `.env` file:

**Loading sequence:**
1. `src/main/index.ts` - Loads `.env` with `override: true` before any imports (main process)
2. `electron.vite.config.ts` - Loads `.env` with `override: true` for Vite configuration (build time)

**Important notes:**
- `override: true` is critical - ensures `.env` values override inherited environment variables
- `src/lib/electron-router-dom.ts` must NOT import Node.js modules (`node:path`, `dotenv`) as it's shared between main and renderer processes
- Port configuration flows: `.env` → main process → `electron-router-dom` settings → Vite dev server

