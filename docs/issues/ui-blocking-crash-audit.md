# Desktop UI Blocking Crash Audit

**Status:** Audit only  
**Severity:** High  
**Scope:** Electron desktop app  
**Primary Risk:** Renderer freezes and Electron main-process stalls caused by synchronous work on UI-critical processes

---

## Summary

The desktop app currently performs blocking work in two places that must stay responsive:

- The **renderer**, where native `confirm()` dialogs still block the event loop.
- The **Electron main process**, where synchronous SQLite, filesystem, and startup work still runs directly on the thread responsible for window lifecycle and IPC.

This is the wrong architectural boundary for long-term reliability. The best long-term fix is not a large collection of small async refactors in place. The best long-term fix is to move all blocking local-work domains behind a dedicated background runtime process and keep both the renderer and Electron main process thin.

## Main Findings

### 1. Local DB access is synchronous in Electron main

The app initializes `better-sqlite3` and runs migrations synchronously in `apps/desktop/src/main/lib/local-db/index.ts`. That database handle is then used directly by main-process tRPC routers and window lifecycle code.

Examples:

- `apps/desktop/src/main/lib/local-db/index.ts`
- `apps/desktop/src/main/windows/main.ts`
- `apps/desktop/src/lib/trpc/routers/workspaces/procedures/query.ts`
- `apps/desktop/src/lib/trpc/routers/settings/index.ts`

This means common UI flows such as sidebar data fetches and settings reads can stall the main process.

### 2. The main-process tRPC router is on the UI-critical path

`createIPCHandler()` attaches the app router in Electron main. Many of those handlers synchronously access local DB state or the filesystem before returning results to the renderer.

That makes the main process an execution engine for local business logic instead of a thin shell.

### 3. Project icons are resolved through synchronous filesystem work

The custom `superset-icon://` protocol resolves icon paths by scanning the icon directory synchronously. Since these requests are tied to normal UI rendering, repeated icon lookups can block the main process while lists render or update.

Examples:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/lib/project-icons.ts`

### 4. Startup still does synchronous setup before the app is fully interactive

The desktop boot path still performs filesystem-heavy setup before or during initial window creation.

Examples:

- agent hook and wrapper generation
- local DB initialization and migrations
- extension discovery in development
- machine ID lookup and related environment setup

Examples:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/lib/agent-setup/`
- `apps/desktop/src/main/lib/extensions/index.ts`
- `apps/desktop/src/main/lib/device-info.ts`

### 5. The renderer still has explicit UI-blocking dialogs

Native browser dialogs block the renderer event loop by design.

Examples:

- `apps/desktop/src/renderer/screens/main/hooks/useCreateOrOpenPR/useCreateOrOpenPR.ts`
- `apps/desktop/src/renderer/routes/_authenticated/settings/project/$projectId/cloud/secrets/components/SecretsSettings/components/EnvironmentVariablesList/components/SecretRow/SecretRow.tsx`

## Best Long-Term Solve

Create a dedicated **desktop runtime process** that owns all blocking local work.

### Process Model

- **Renderer**
  - React UI only
  - optimistic updates
  - async queries/subscriptions
  - app-managed dialogs only

- **Electron main**
  - windows
  - tray
  - menus
  - notifications
  - protocol registration
  - crash recovery
  - thin async broker only

- **Desktop runtime process**
  - local SQLite
  - filesystem access
  - git operations
  - shell commands
  - icon lookup and caching
  - slash command discovery
  - startup scans and setup
  - state aggregation for renderer read models

- **Terminal host**
  - remains a separate process for terminal-specific workload

- **Optional worker pool inside desktop runtime**
  - CPU-heavy parsing
  - indexing
  - search
  - diffing
  - large transforms

## Why This Architecture Is Best

- It gives a real isolation boundary. Blocking local work no longer freezes the renderer or the Electron main process.
- It allows continued use of fast synchronous libraries like `better-sqlite3`, but only in a safe process.
- It improves crash isolation. A bad local operation can restart the runtime process without taking down the app shell.
- It matches the existing sidecar direction already used for terminal-related functionality.
- It simplifies performance rules: if an operation can block, it does not belong in renderer or main.

## Recommended Runtime Contract

Use typed async RPC between processes plus event subscriptions for invalidation.

### Renderer -> main

- async IPC only
- no sync IPC

### Main -> desktop runtime

- async request/response
- streaming or subscriptions where needed
- cancellation support for long-running work

### Desktop runtime -> main/renderer

- push invalidation events
- push status updates
- push cached snapshot refreshes

## Data Model Recommendation

Do not make the renderer assemble UI state from many small local calls.

Instead, the runtime should own read models such as:

- workspace sidebar snapshot
- project summary snapshot
- settings snapshot
- icon manifest
- recent activity snapshot

The renderer should fetch coarse-grained snapshots and subscribe to invalidation.

## Migration Plan

### Phase 1: Remove explicit blockers in the renderer

- Replace native `confirm()` calls with app dialogs.
- Ban `alert`, `confirm`, and `prompt` in renderer lint rules.

### Phase 2: Make Electron main thin

- Stop adding new local DB or filesystem business logic to Electron main.
- Move project icon lookup, slash command discovery, and similar blocking lookups behind async runtime calls.
- Defer non-essential startup work until after first paint.

### Phase 3: Offload high-latency workspace mutations to runtime workers

- Introduce a runtime job layer for the most blocking operations before the full platform migration is complete.
- Start with git worktree create and delete flows, since they can block for a long time on git, filesystem teardown, and cleanup.
- Route those operations through async runtime jobs with progress, cancellation, retries where safe, and terminal status events for the UI.
- Keep Electron main as a broker that submits jobs and forwards updates, rather than executing the work directly.
- Use this phase to prove the worker/runtime contract on the worst latency paths before moving the rest of local state management.

Examples of good first candidates:

- git worktree creation
- git worktree deletion
- branch sync or fetch paths tied to workspace lifecycle
- large filesystem cleanup during workspace teardown

### Phase 4: Move local DB ownership to desktop runtime

- Move `better-sqlite3` usage out of Electron main.
- Move settings, workspaces, projects, and sidebar query assembly into desktop runtime.
- Keep main as a broker.

### Phase 5: Publish read models instead of raw local joins

- Replace repeated synchronous joins with runtime-owned snapshots.
- Invalidate snapshots on mutations instead of rebuilding them ad hoc in the UI path.

### Phase 6: Add enforcement

- Ban Node `*Sync` APIs in renderer and Electron main, except in tightly-reviewed boot shims if unavoidable.
- Ban `better-sqlite3` imports outside desktop runtime.
- Add event loop lag monitoring for renderer and main.
- Track startup stages and time-to-first-interaction.

## Guardrails

Adopt these rules for desktop code:

- If it can block, it does not run in renderer.
- If it can block, it does not run in Electron main.
- `async` wrappers around synchronous libraries do not count as non-blocking.
- Renderer gets snapshots, not N small joins.
- Main brokers; runtime executes.

## Immediate Wins While Migrating

These are worth doing before the full architecture lands:

- Replace the two renderer `confirm()` usages with app dialogs.
- Remove sync filesystem work from the `superset-icon://` handler.
- Move agent hook setup off the critical startup path.
- Avoid synchronous window-state persistence during interactive resize paths if possible.

## Proposed End State

The desktop app should behave like this:

- The renderer always stays responsive.
- Electron main never performs meaningful blocking local work.
- The runtime process owns local execution and state assembly.
- Heavy operations fail or restart independently without freezing the app shell.

That is the cleanest long-term architecture for eliminating UI-blocking operations in the desktop app.
