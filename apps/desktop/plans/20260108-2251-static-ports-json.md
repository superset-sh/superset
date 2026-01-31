# Static Ports Configuration via ports.json

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template at `.agents/commands/create-plan.md`.

## Purpose / Big Picture

After this change, users can define static port entries in a `.superset/ports.json` file within their repository. When this file is present, the Ports section in the left sidebar will display the configured ports with custom labels instead of dynamically scanning for listening processes. This is useful for teams who want consistent port documentation or for projects where dynamic port scanning doesn't work well.

Users will see: ports configured in `ports.json` appear as clickable badges in the PORTS section of the sidebar, each showing the port number with a tooltip displaying the custom label. If the file is malformed, a toast notification appears explaining the error and no ports are shown.

## Assumptions

1. The `.superset` directory already exists in repositories using Superset (same location as `config.json` for setup/teardown scripts).
2. Static ports should completely replace dynamic port discovery when `ports.json` is present (not merge with dynamic ports).
3. Each workspace reads from its own worktree's `.superset/ports.json` file (workspace-scoped, not project-scoped).

## Open Questions

None remaining - all questions resolved in Decision Log below.

## Progress

- [x] (2026-01-08 22:51Z) Define `StaticPort` type in `apps/desktop/src/shared/types/ports.ts`
- [x] (2026-01-08 22:52Z) Add `PORTS_FILE_NAME` constant to `apps/desktop/src/shared/constants.ts`
- [x] (2026-01-08 22:53Z) Create `apps/desktop/src/main/lib/static-ports/` module with loader and validator
- [x] (2026-01-08 22:54Z) Write unit tests for static ports loader (24 tests, all passing)
- [x] (2026-01-08 22:55Z) Create tRPC procedures `ports.hasStaticConfig`, `ports.getStatic`, and `ports.subscribeStatic`
- [x] (2026-01-08 22:56Z) Update `PortsList.tsx` to check for static config and display accordingly
- [x] (2026-01-08 22:57Z) Create `StaticPortBadge` component (no pane linking, label in tooltip)
- [x] (2026-01-08 22:58Z) Add toast notification for malformed ports.json errors
- [x] (2026-01-08 22:59Z) Create file watcher for live reload of ports.json changes
- [x] (2026-01-08 23:00Z) Create marketing documentation page at `apps/marketing/src/app/ports/page.tsx`
- [x] (2026-01-08 23:01Z) Run typecheck and lint - all passing
- [ ] Manual validation

## Surprises & Discoveries

- Observation: Toast import path is `@superset/ui/sonner`, not `sonner` directly
  Evidence: Other components in the codebase use this import path

- Observation: File watching needed additional logic to handle both file and directory watching
  Evidence: When ports.json doesn't exist, we watch the .superset directory for file creation; when it exists, we watch the file directly for changes

## Decision Log

- Decision: Workspace-scoped ports.json reading
  Rationale: User requested this approach. Each workspace's worktree has its own `.superset/ports.json`, allowing different branches to have different port configurations.
  Date/Author: 2026-01-08 / Planning phase

- Decision: Toast notification for malformed ports.json errors
  Rationale: User preference. Consistent with how other errors are displayed in the app. Toast is dismissible and non-blocking.
  Date/Author: 2026-01-08 / Planning phase

- Decision: Static port tooltips show label only (no PID/process info)
  Rationale: User preference. Static ports don't have process information, so showing just the custom label keeps the UI clean.
  Date/Author: 2026-01-08 / Planning phase

- Decision: Static ports completely replace dynamic discovery when present
  Rationale: Provides predictable behavior. If a user wants static ports, they likely don't want dynamic ports interfering.
  Date/Author: 2026-01-08 / Planning phase

- Decision: Add file watching for live reload of ports.json changes
  Rationale: User requested that changes to ports.json be detected automatically. Using fs.watch with debouncing provides responsive updates without polling overhead.
  Date/Author: 2026-01-08 / Implementation phase

- Decision: Skip Zustand store modifications for static ports
  Rationale: Static ports don't need subscription management like dynamic ports. Using tRPC queries directly in the component is cleaner and follows the existing React Query pattern.
  Date/Author: 2026-01-08 / Implementation phase

## Outcomes & Retrospective

(To be completed after implementation)

## Context and Orientation

This feature affects the **desktop app** (`apps/desktop`). The marketing documentation page affects `apps/marketing`.

### Current Port Discovery Architecture

The desktop app has a dynamic port scanning system:

1. **Port Scanner** (`apps/desktop/src/main/lib/terminal/port-scanner.ts`): Cross-platform utility that uses `lsof` (macOS/Linux) or `netstat` (Windows) to find listening TCP ports for given process IDs.

2. **Port Manager** (`apps/desktop/src/main/lib/terminal/port-manager.ts`): Singleton that tracks terminal sessions, periodically scans their process trees for ports, and emits `port:add` / `port:remove` events. Key methods:
   - `registerSession(session, workspaceId)`: Start tracking a terminal
   - `unregisterSession(paneId)`: Stop tracking and remove ports
   - `getAllPorts()`: Return all currently detected ports

3. **tRPC Router** (`apps/desktop/src/lib/trpc/routers/ports/ports.ts`): Exposes `getAll` (query) and `subscribe` (subscription) procedures that delegate to the port manager.

4. **Renderer Store** (`apps/desktop/src/renderer/stores/ports/store.ts`): Zustand store holding `ports: DetectedPort[]` array and UI state like `isListCollapsed`.

5. **UI Component** (`apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/PortsList.tsx`): Displays ports grouped by workspace. Each port badge shows the port number, with tooltip showing process name and PID. Clicking focuses the terminal pane that owns the port.

### Existing Types

    // apps/desktop/src/shared/types/ports.ts
    export interface DetectedPort {
        port: number;
        pid: number;
        processName: string;
        paneId: string;
        workspaceId: string;
        detectedAt: number;
        address: string;
    }

### Configuration Pattern Reference

The existing `config.json` setup/teardown feature provides a pattern to follow:

- Constants defined in `apps/desktop/src/shared/constants.ts`: `PROJECT_SUPERSET_DIR_NAME = ".superset"`, `CONFIG_FILE_NAME = "config.json"`
- Loading logic in `apps/desktop/src/lib/trpc/routers/workspaces/utils/setup.ts`: `loadSetupConfig(mainRepoPath)` reads and validates JSON
- Tests in `apps/desktop/src/lib/trpc/routers/workspaces/utils/setup.test.ts`

### Workspace Path Access

Workspaces store their worktree path. The workspaces tRPC router (`apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts`) provides `getActive` and `getAll` procedures. Each workspace has a `repoPath` field that points to its worktree directory.

### Toast Notifications

The app uses `sonner` for toast notifications. Import `toast` from `@superset/ui/sonner` and call `toast.error("message")` to show an error toast.

## Plan of Work

### Milestone 1: Types and Constants

Add the new type for static ports and the constant for the filename.

**File: `apps/desktop/src/shared/types/ports.ts`**

Add a new interface for static ports:

    export interface StaticPort {
        port: number;
        label: string;
        workspaceId: string;
    }

The `StaticPort` differs from `DetectedPort` in that it has no `pid`, `processName`, `paneId`, `detectedAt`, or `address` fields. Instead it has a `label` for display.

**File: `apps/desktop/src/shared/constants.ts`**

Add a constant for the ports config filename:

    export const PORTS_FILE_NAME = "ports.json";

### Milestone 2: Static Ports Loader

Create a new module to load and validate `ports.json`.

**File: `apps/desktop/src/main/lib/static-ports/loader.ts`**

Create a function `loadStaticPorts(worktreePath: string)` that:

1. Constructs path: `join(worktreePath, PROJECT_SUPERSET_DIR_NAME, PORTS_FILE_NAME)`
2. Checks if file exists using `existsSync`
3. If not exists, returns `{ exists: false, ports: null, error: null }`
4. If exists, reads the file with `readFileSync`
5. Parses JSON with `JSON.parse` (catch parse errors)
6. Validates structure:
   - Root must have a `ports` key that is an array
   - Each element must have `port` (number, 1-65535) and `label` (non-empty string)
7. Returns `{ exists: true, ports: StaticPort[], error: null }` on success
8. Returns `{ exists: true, ports: null, error: string }` on validation failure

**File: `apps/desktop/src/main/lib/static-ports/index.ts`**

Export the loader function.

**File: `apps/desktop/src/main/lib/static-ports/loader.test.ts`**

Unit tests covering:
- File does not exist: returns `{ exists: false, ports: null, error: null }`
- Valid JSON with ports array: returns parsed ports
- Invalid JSON syntax: returns error
- Missing `ports` key: returns error
- `ports` is not an array: returns error
- Port entry missing `port` field: returns error
- Port entry missing `label` field: returns error
- Port number out of range: returns error
- Empty label: returns error

### Milestone 3: tRPC Router Updates

Add procedures to check for and load static ports.

**File: `apps/desktop/src/lib/trpc/routers/ports/ports.ts`**

Add two new procedures:

1. `hasStaticConfig`: Query that takes `{ workspaceId: string }`, looks up the workspace's `repoPath`, and returns `{ hasStatic: boolean }` indicating whether `ports.json` exists.

2. `getStatic`: Query that takes `{ workspaceId: string }`, looks up the workspace's `repoPath`, calls `loadStaticPorts`, and returns `{ ports: StaticPort[] | null, error: string | null }`.

This requires importing from the workspaces schema and the static-ports loader.

### ~~Milestone 4: Renderer Store Updates~~ (SKIPPED)

> **Note:** This milestone was intentionally skipped. See Decision Log entry "Skip Zustand store modifications for static ports". The implementation uses tRPC queries directly in the component instead, which is cleaner and follows the existing React Query pattern.

### Milestone 5: PortsList UI Updates

Update the PortsList component to handle static ports.

**File: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/PortsList/PortsList.tsx`**

Changes:

1. Add query for `trpc.ports.hasStaticConfig.useQuery({ workspaceId: activeWorkspace?.id })` when active workspace exists.

2. When static config exists, fetch with `trpc.ports.getStatic.useQuery({ workspaceId })` instead of subscribing to dynamic ports.

3. If static ports returns an error, show a toast with `toast.error()` and display nothing in the ports list.

4. Create a new `StaticPortBadge` component variant that:
   - Shows port number
   - Has tooltip with just the label (no PID/process info)
   - Opens `http://localhost:{port}` in browser on external link click
   - Does NOT link to a terminal pane (no `handleClick` to focus pane)

5. When displaying static ports, don't group by workspace since they're already workspace-scoped. Just show the static ports for the active workspace.

### Milestone 6: Marketing Documentation Page

Create documentation page following the pattern of the scripts page.

**File: `apps/marketing/src/app/ports/page.tsx`**

Create a new page with:

1. Title: "Static Port Configuration"
2. Subtitle: "Define custom ports for your workspace with ports.json"

3. **Overview section**: Explain that Superset normally auto-discovers ports from running processes, but you can override this with a static configuration file.

4. **Configuration section**: Show path `.superset/ports.json`

5. **Schema section**: Show example:
   ```json
   {
     "ports": [
       { "port": 3000, "label": "Frontend Dev Server" },
       { "port": 8080, "label": "API Server" },
       { "port": 5432, "label": "PostgreSQL" }
     ]
   }
   ```

6. **Field descriptions**:
   - `ports`: Array of port definitions
   - `port`: Port number (1-65535)
   - `label`: Display text shown in tooltip

7. **Behavior section**: Explain:
   - Static config completely replaces dynamic discovery
   - File is read from the workspace's worktree, so different branches can have different configs
   - If malformed, an error toast appears and no ports are shown

8. **Tips section**:
   - Document ports that aren't auto-detected (like databases)
   - Share port documentation with your team by committing `.superset/ports.json`
   - Use meaningful labels to help teammates understand what each port is for

## Concrete Steps

After implementing each milestone, verify with:

    cd apps/desktop
    bun run typecheck
    # Expected: No type errors

    cd ../..
    bun run lint
    # Expected: No lint errors

    cd apps/desktop
    bun test src/main/lib/static-ports/loader.test.ts
    # Expected: All tests pass

For manual validation:

    bun dev
    # Desktop app opens

    # Test 1: No ports.json
    # Create a workspace, start a dev server
    # Verify ports appear dynamically in sidebar

    # Test 2: Valid ports.json
    # In the workspace's worktree, create .superset/ports.json:
    # { "ports": [{ "port": 3000, "label": "Test Server" }] }
    # Refresh/switch workspace, verify static port appears with label in tooltip

    # Test 3: Malformed ports.json
    # Change ports.json to invalid JSON: { "ports": invalid }
    # Refresh, verify error toast appears and no ports shown

    # Test 4: Invalid schema
    # Change to: { "ports": [{ "port": "not-a-number", "label": "Test" }] }
    # Refresh, verify error toast about invalid port number

## Validation and Acceptance

1. **Type safety**: Run `bun run typecheck` in apps/desktop - no errors

2. **Lint**: Run `bun run lint` at root - no errors

3. **Unit tests**: Run `bun test apps/desktop/src/main/lib/static-ports/` - all pass

4. **Manual test - no config**: With no `.superset/ports.json`, dynamic port discovery works as before

5. **Manual test - valid config**: With valid `ports.json`, static ports appear with custom labels in tooltips

6. **Manual test - malformed JSON**: With invalid JSON, error toast appears, no ports shown

7. **Manual test - invalid schema**: With invalid schema, descriptive error toast appears, no ports shown

8. **Marketing page**: Navigate to `http://localhost:3001/ports` (marketing site), verify documentation renders correctly

## Idempotence and Recovery

All steps are idempotent:
- File creation is additive
- Type additions don't break existing code
- tRPC procedures are independent queries
- Store state changes are isolated

If a step fails partway, you can re-run from the beginning of that milestone. No database migrations or destructive changes are involved.

## Artifacts and Notes

**ports.json schema example:**

    {
      "ports": [
        { "port": 3000, "label": "Frontend Dev Server" },
        { "port": 8080, "label": "API Server" }
      ]
    }

**Expected loader return types:**

    // File doesn't exist
    { exists: false, ports: null, error: null }

    // Valid file
    { exists: true, ports: [{ port: 3000, label: "Frontend", workspaceId: "ws-123" }], error: null }

    // Invalid file
    { exists: true, ports: null, error: "Invalid JSON: Unexpected token..." }

## Interfaces and Dependencies

### New Type Definitions

    // apps/desktop/src/shared/types/ports.ts
    export interface StaticPort {
        port: number;
        label: string;
        workspaceId: string;
    }

    // Loader return type
    export interface StaticPortsResult {
        exists: boolean;
        ports: Omit<StaticPort, 'workspaceId'>[] | null;
        error: string | null;
    }

### New tRPC Procedures

    // ports.hasStaticConfig
    input: z.object({ workspaceId: z.string() })
    output: { hasStatic: boolean }

    // ports.getStatic
    input: z.object({ workspaceId: z.string() })
    output: { ports: StaticPort[] | null, error: string | null }

### Dependencies

No new npm dependencies required. Uses existing:
- `node:fs` for file operations (main process only)
- `node:path` for path construction
- `zod` for input validation in tRPC
- `@superset/ui/sonner` for toast notifications (already used in app)
