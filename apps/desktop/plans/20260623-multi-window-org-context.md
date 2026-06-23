# Multi-Window with Per-Window Organization Context (VS Code–style "New Window")

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from the root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template/guide.

This plan implements GitHub issue **#4018** ("Add a platform-level layer above Project to group multiple repos"), specifically its **option 3(b): per-window organization context** — the smallest slice that delivers the real goal of working on multiple platforms at once.


## Purpose / Big Picture

Today the Superset desktop app (an Electron application — Electron is the framework that lets a web app run as a native macOS app) can only show **one window**, bound to **one organization** at a time. An "organization" (often shown in the UI as the workspace/platform name, e.g. the "AML" entry with an `A` avatar at the top-left of the sidebar) is the account-level grouping that owns your projects, tasks, and workspaces. Because there is only ever one window and it reads its organization from a single shared login session, you cannot look at two organizations side by side — for example, one organization on your left monitor and another on your right.

After this change, the app behaves like VS Code's **File → New Window**: you press **Cmd+N** (or use the `File` menu) and a genuinely separate window opens. Each window shows exactly one organization, and **switching the organization in one window never affects another window**. You can put two windows on two monitors, each on a different platform, all under your single login. Each window's title shows its organization name so you can tell them apart at a glance. When you quit with several windows open and relaunch, every window reopens on the organization and screen position it had.

How to see it working when done:

1. Run the app in development (`bun dev` from the repo root, then the Electron window opens).
2. Sign in (dev sign-in: `admin@local.test` / `supersetdev`).
3. Press **Cmd+N**. A second, independent window opens on the same organization.
4. In the second window, open the organization dropdown (top-left, the avatar + name) and switch to a different organization. The **first window stays on its original organization** — its task list, projects, and sidebar do not change.
5. Each window's title (visible in macOS Mission Control / the window switcher) reads `<Organization Name> — Superset`.
6. Quit the app with both windows open, relaunch, and both windows reopen on their respective organizations.


## Assumptions

These are working assumptions that unblock planning. Each must be confirmed (and moved to the Decision Log) or removed by the end of implementation.

- **A1. (CONFIRMED — see D1, Spike 0 complete.)** `trpc-electron@0.1.2` lets us build a per-call **context** that knows which window made the call, by exposing the underlying Electron IPC event whose `sender` is the calling window's web contents. This is the mechanism we rely on to route "set my window's org" to the correct window.
- **A2.** Setting `document.title` in the renderer propagates to the native window title (`BrowserWindow.getTitle()`), so each window can title itself with its org name from the renderer without a dedicated IPC call. If false, we add a small `window.setTitle` procedure (see Plan of Work, Milestone 3).
- **A3.** The desktop renderer runs each `BrowserWindow` in its **own JavaScript context** (separate module instances), so module-level singletons such as the org id used for request headers are naturally per-window. This is standard Electron behavior and is the same reason the existing module-level `authToken` in `auth-client.ts` works per renderer.
- **A4.** The cloud API already honors a per-request organization override header named `x-superset-organization-id` and validates that the user belongs to that org. (Confirmed by reading `packages/trpc/src/trpc.ts:51` and `packages/shared/src/constants.ts:5`; restated as Decision D2.)
- **A5.** macOS is the only platform we must make correct for v1 (the repo states macOS is the primary supported platform in `DEVELOPMENT.md`). Windows/Linux must still compile and not regress single-window behavior, but multi-window polish there is out of scope.


## Open Questions

- **Q1 — RESOLVED (Spike 0, 2026-06-23).** `trpc-electron@0.1.2`'s `createIPCHandler` accepts `createContext?: (opts: { event: IpcMainInvokeEvent }) => Context`, and the event is invoked with the sender attached (`handleIPCMessage.ts:50`: `const ctx = (await createContext?.({ event })) ?? {}`). `event.sender` is the calling window's `WebContents`, so `BrowserWindow.fromWebContents(event.sender)` yields the calling window. → Decision **D1** (resolved below).
- **Q2 (Plan of Work, Milestone 2).** When the very first window opens for an existing user who already has a server-side "active organization", what should that window's initial org be? Proposed: fall back to the session's `activeOrganizationId` when the per-window registry has no value yet, then record it. → Decision **D3** (proposed-resolved below; confirm during implementation).
- **Q3 (Plan of Work, Milestone 3).** Should the organization dropdown also get an explicit "Open in new window" item per org, or is Cmd+N (open new window, then switch) sufficient for v1? Per the design discussion this is a secondary nicety. Proposed: include it because it is cheap once `window.openNew` exists. → Decision **D4** (proposed-resolved; confirm during implementation).
- **Q4 (Plan of Work, Milestone 1).** With multiple windows, which window should receive a desktop notification click and OS deep links (`superset://…`)? Proposed for v1: the **last-focused** window (fallback: the first window). Finer per-window routing (route to the window that owns the workspace) is out of scope. → Decision **D5** (proposed-resolved).


## Progress

- [x] (2026-06-23 07:20Z) Verified single-instance lock, window factory, menu, renderer org touchpoints, and the cloud org header against the working tree (see Context and Orientation).
- [x] (2026-06-23 07:20Z) Drafted this ExecPlan end-to-end with milestones and a de-risking spike.
- [x] (2026-06-23 07:34Z) Spike 0: confirmed `trpc-electron@0.1.2` per-window context mechanism (Q1 → D1 resolved: `createContext({ event })` → `BrowserWindow.fromWebContents(event.sender)`). `bun install` running; package present and inspected.
- [x] (2026-06-23 11:00Z) Milestone 1: main-process refactor done. `window-registry` module + 10 unit tests (green); `MainWindow()` split into `initAppServices()` (once: IPC handler + menu) and `createPlatformWindow({ orgId, bounds })` (per-window, repeatable); shared services (notifications server on fixed port, terminal/notification listeners) gated to start on first window / stop on last; `index.ts`, `focusMainWindow`, and deep-link routing now use the registry. Typecheck + lint clean. Commit 73971622a.
- [x] (2026-06-23 11:00Z) Pulled the **New Window** entry (Cmd+N, File menu) forward from Milestone 3 so the multi-window plumbing is verifiable now. A new window currently mirrors the focused window's org (independence lands in Milestone 2). Wired via `menuEmitter` "new-window" → `createPlatformWindow` to avoid a menu↔window circular import.
- [ ] Milestone 2: per-window org context (registry org id, `window.getActiveOrg`/`setActiveOrg`, renderer reads window org, `x-superset-organization-id` header, window-local switching).
- [ ] Milestone 3: New Window UX (File → New Window + Cmd+N, `window.openNew`, optional org-dropdown action, per-window title).
- [ ] Milestone 4: restore-all-windows (per-window persisted `{ orgId, bounds }`, `restoreWindows()` on launch).
- [ ] Validation pass: `bun run typecheck`, `bun run lint`, `bun test` all green; manual two-window acceptance.


## Surprises & Discoveries

- Observation (real-world confirmation of #4018's premise): running the dev build while the installed `/Applications/Superset.app` is open is blocked by the single-instance lock — the dev window silently fails to appear.
  Evidence: `getWorkspaceName()` (`apps/desktop/src/shared/env.shared.ts:42-48`) returns `undefined` when `SUPERSET_WORKSPACE_NAME === "superset"` (the default written by `setup.local.sh`). With no name, `index.ts` skips `app.setName(...)`, so the dev app's name — and thus its Electron `userData` dir and single-instance lock — collides with the installed app. The dev instance loses `requestSingleInstanceLock()` and `app.exit(0)`s, which also tears down electron-vite (Vite port 3005 never stays up). Fix for local dev: set a distinct `SUPERSET_WORKSPACE_NAME` (we used `"multispace"`) in `.env` so the dev build runs as `Superset (multispace)` with its own `userData`/lock. This is exactly the isolation the feature generalizes to per-window org context.
- Observation (Spike 0): `trpc-electron@0.1.2` passes the Electron IPC event to `createContext`, so the calling window is identifiable per request.
  Evidence: `apps/desktop/node_modules/trpc-electron/dist/main.d.ts` declares `createIPCHandler<TRouter>({ createContext?: (opts: { event: IpcMainInvokeEvent }) => MaybePromise<Context>; router; windows? })`; `src/main/handleIPCMessage.ts:50` calls `const ctx = (await createContext?.({ event })) ?? {}`; `event.sender` (a `WebContents`) is used at `src/main/createIPCHandler.ts:15` and `src/main/handleIPCMessage.ts:53`. Therefore `createContext: ({ event }) => ({ senderWindow: BrowserWindow.fromWebContents(event.sender) })` is the routing mechanism — the preferred path in the plan; no fallback needed.
- Observation: The renderer's window loader ignores URL query parameters in development.
  Evidence: `apps/desktop/src/lib/window-loader.ts` loads a fixed `http://localhost:${DESKTOP_VITE_PORT}/#/` in dev and only uses `htmlFile` in production; the `query` field on `registerRoute` is never appended to the dev URL. Therefore we cannot seed a new window's org via a URL query param; the per-window org must be delivered over IPC (the `window.getActiveOrg` procedure). This shaped Milestone 2.
- Observation: `MainWindow()` is a single-window "god function".
  Evidence: `apps/desktop/src/main/windows/main.ts` holds a module-level `let currentWindow`, creates the tRPC IPC handler once around a `getWindow()` getter, starts a notifications HTTP server on a **fixed port** (`notificationsApp.listen(env.DESKTOP_NOTIFICATIONS_PORT, …)`, line 182), and registers terminal/notification listeners — all inside the per-window function. Calling it twice would bind the port twice (crash) and double-register listeners. This is why Milestone 1 separates one-time app services from per-window setup.


## Decision Log

- Decision **D2**: Use the existing cloud API header `x-superset-organization-id` to scope each window's API calls to its window-local org.
  Rationale: The server already reads and membership-validates this header (`packages/trpc/src/trpc.ts:50-70`) and the CLI/MCP already use it; the desktop API client simply does not send it yet. No server changes required.
  Date/Author: 2026-06-23 / plan author.
- Decision **D3 (proposed)**: A window's org is sourced from the main-process window registry; if the registry has no value for that window yet (e.g. an existing user's first window after upgrade), the renderer falls back to the Better Auth session's `activeOrganizationId`, then writes that value back into the registry via `window.setActiveOrg`.
  Rationale: Preserves the current behavior for existing users while making the registry the single per-window source of truth going forward.
  Date/Author: 2026-06-23 / plan author. Confirm during Milestone 2.
- Decision **D5 (proposed)**: Notification clicks and `superset://` deep links target the last-focused window (fallback: first window) for v1.
  Rationale: Smallest correct behavior; avoids building workspace-to-window ownership mapping now.
  Date/Author: 2026-06-23 / plan author.
- Decision **D1 (RESOLVED 2026-06-23, Spike 0)**: Identify the calling window via a tRPC context built from the IPC sender — `createContext: ({ event }) => ({ senderWindow: BrowserWindow.fromWebContents(event.sender) })` — giving every procedure `ctx.senderWindow`. The fallback "explicit windowId input" is not needed.
  Rationale: `trpc-electron@0.1.2` supports `createContext({ event })` and exposes `event.sender` (verified in installed source — see Surprises & Discoveries). Procedure signatures in Milestones 2/3 use the context form (no `windowId` inputs).
  Date/Author: 2026-06-23 / plan author.
- Decision **D4**: _pending_ — whether to ship the org-dropdown "Open in new window" item in v1.
- Decision **D6 (2026-06-23)**: New Window ships as a **File-menu item with no keyboard shortcut**, and the hotkey registry is left untouched.
  Rationale: Cmd+N is already New Workspace and ⇧⌘N is a reserved (currently unimplemented, single-reference, no-handler) `QUICK_CREATE_WORKSPACE` placeholder. Briefly trialed New Window on ⇧⌘N (moving the placeholder to ⌘⌃N), but for upstream acceptance the smallest single-concern diff wins: a new menu item collides with nothing, doesn't disturb a maintainer-reserved shortcut, and leaves shortcut philosophy to the maintainers. Locally the window still opens via File → New Window. A shortcut can be added if a maintainer requests it.
  Date/Author: 2026-06-23 / plan author (per user steer toward easiest-to-accept).


## Outcomes & Retrospective

To be filled at milestone boundaries and at completion. Compare against Purpose: can a user open two windows on two organizations, switch each independently, see distinct titles, and have both restored after relaunch?


## Context and Orientation

This work is entirely within **one app**: `apps/desktop` (the Electron desktop app). No database (`packages/db`) or web app (`apps/web`) changes are required. It touches **one shared constant** that already exists in `packages/shared`. Below, every term of art is defined and anchored to real files.

### What "main process" and "renderer" mean here

An Electron app has two kinds of code:

- **Main process** — Node.js code that controls native windows and the OS. Lives under `apps/desktop/src/main/`. It may use Node modules.
- **Renderer process** — the web UI (React) that runs inside each window. Lives under `apps/desktop/src/renderer/`. It is a browser environment and must **not** import Node modules. (Run `bun run lint:check-node-imports` to detect violations.)

Each open window has its **own** renderer process (its own JavaScript memory).

### What "tRPC" and the per-window context mean here

"tRPC" is the type-safe remote-call layer. In the desktop app it runs over Electron IPC (inter-process communication — messages between renderer and main) using the `trpc-electron` library. The renderer calls procedures like `trpc.window.minimize.useMutation()` and the main process handles them.

- The whole router is assembled in `apps/desktop/src/lib/trpc/routers/index.ts` by `createAppRouter(getWindow)`. Note it is given a single `getWindow: () => BrowserWindow | null` getter — i.e. today there is a notion of *the* window, not *which* window called.
- The window-related procedures live in `apps/desktop/src/lib/trpc/routers/window.ts` (`createWindowRouter(getWindow)`): `minimize`, `maximize`, `close`, `isMaximized`, `getPlatform`, `getHomeDir`, `getDirectoryStatus`, `selectDirectory`, `selectImageFile`. Each OS-control procedure calls `getWindow()` to act on "the" window.
- The IPC handler is created once in `apps/desktop/src/main/windows/main.ts:176` via `createIPCHandler({ router: createAppRouter(getWindow), windows: [window] })`, and additional windows are attached with `ipcHandler.attachWindow(window)` (line 174).

To make org context per-window we need each procedure call to know **which** window sent it. The standard Electron way is to read the IPC event's `sender` (a `WebContents`) and map it with `BrowserWindow.fromWebContents(sender)`. Whether `trpc-electron@0.1.2` surfaces that event to a `createContext` callback is **Spike 0**.

### How the window is created today (single window)

- `apps/desktop/src/main/windows/main.ts` exports `async function MainWindow()`. It:
  - loads a single saved window state (`loadWindowState()` from `apps/desktop/src/main/lib/window-state/window-state.ts`),
  - builds the `BrowserWindow` via `createWindow({ id: "main", … })` (`apps/desktop/src/lib/electron-app/factories/windows/create.ts`), which uses partition `persist:superset` (a shared cookie/storage area for all windows),
  - calls `createApplicationMenu()` (`apps/desktop/src/main/lib/menu.ts`),
  - sets `currentWindow = window`,
  - creates or attaches the tRPC IPC handler,
  - **starts the notifications HTTP server on a fixed port** and wires `NotificationManager` + terminal listeners to this one window,
  - persists window bounds on move/resize/close.
- `apps/desktop/src/main/index.ts` boots the app: it acquires the single-instance lock (line 326), and after `app.whenReady()` calls `await makeAppSetup(() => MainWindow())` (line 428). `makeAppSetup` (`apps/desktop/src/lib/electron-app/factories/app/setup.ts`) reuses an existing window if present, else creates one, and on macOS `activate` it shows existing windows.
- `focusMainWindow()` (`apps/desktop/src/main/index.ts:110`) and deep-link handling (`processDeepLink`, line 81) currently target `BrowserWindow.getAllWindows()[0]`.
- The window-id type is restricted: `apps/desktop/src/lib/window-loader.ts` declares `type WindowId = "main" | "about"`. All platform windows will continue to use id `"main"` (they load the same renderer route); the id is only used for logging and route loading.

### The application menu today

`apps/desktop/src/main/lib/menu.ts` builds the macOS menu. The `File` submenu (lines 19-42) currently contains only **"Open Repo…" (Cmd+O)**, a separator, and **"Close Window"**. **Cmd+N is unbound** anywhere in the menu (used accelerators: Cmd+R reload, Cmd+Shift+Q close, Cmd+/ shortcuts, Cmd+, settings, Cmd+O open). Menu click handlers run in the main process; some emit events through `menuEmitter` (`apps/desktop/src/main/lib/menu-events.ts`).

### How a window gets its organization today (renderer)

- **Source of truth:** the Better Auth login session. `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` reads it at lines 33-38:

      export function CollectionsProvider({ children }: { children: ReactNode }) {
        const { data: session, refetch: refetchSession } = authClient.useSession();
        const [isSwitching, setIsSwitching] = useState(false);
        const activeOrganizationId = env.SKIP_ENV_VALIDATION
          ? MOCK_ORG_ID
          : session?.session?.activeOrganizationId;

- **Switching org** mutates the **shared** session (lines 40-53) — this is exactly what makes a second window impossible to keep independent:

      const switchOrganization = useCallback(
        async (organizationId: string) => {
          if (organizationId === activeOrganizationId) return;
          setIsSwitching(true);
          try {
            await authClient.organization.setActive({ organizationId });
            await preloadCollections(organizationId);
            await refetchSession();
          } finally {
            setIsSwitching(false);
          }
        },
        [activeOrganizationId, refetchSession],
      );

- The provider then builds org-scoped data with `getCollections(activeOrganizationId)` (lines 60-66) and exposes `{ ...collections, switchOrganization }` via React context (`useCollections()`).
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` independently reads the same session field (lines 66-68) and redirects to `/create-organization` if there is none (lines 197-199). It renders `<CollectionsProvider>` with no props (line 211); the provider re-derives the org itself.
- The only caller of `switchOrganization` is the org dropdown: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown/OrganizationDropdown.tsx:164` (`onSelect={() => collections.switchOrganization(organization.id)}`).

### How org-scoped data is fetched today

- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` is the data layer. It creates a **singleton API client** whose headers send only the bearer token, **no org header** (lines 219-238):

      const apiClient = createTRPCProxyClient<AppRouter>({
        links: [
          httpBatchLink({
            url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
            headers: () => {
              const token = getAuthToken();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
            transformer: superjson,
          }),
        ],
      });

- It also builds Electric collections (Electric is the sync engine that streams rows from the server). **Every** org-scoped collection already passes `organizationId` as a shape parameter, e.g. tasks (lines 272-301): `params: { table: "tasks", organizationId }`. So Electric is already correctly scoped by org — the gap is only the tRPC `apiClient` (used by mutations like `task.update`) which sends no org header.
- Collections are cached per org in a `Map<string, OrgCollections>` (`collections.ts:213`) and obtained via `export function getCollections(organizationId: string)` (line 938). Two orgs can coexist in one renderer with no collision.
- The bearer token and JWT are module-level in `apps/desktop/src/renderer/lib/auth-client.ts` (lines 12-30: `getAuthToken`/`setAuthToken`, `getJwt`/`setJwt`). The JWT spans **all** the user's orgs, so switching org needs **no** re-auth.

### The cloud org header (already supported, no server change)

- `packages/shared/src/constants.ts:5`: `export const ORGANIZATION_HEADER = "x-superset-organization-id";`
- `packages/trpc/src/trpc.ts:51`: the server reads `ctx.headers.get(ORGANIZATION_HEADER)`, validates membership, and overrides the request's organization. This is Decision D2's foundation.


## Plan of Work

The work proceeds as one de-risking spike followed by four milestones. Each milestone keeps the app working (additive-then-subtractive: we add the per-window path, prove it, and only then remove the session-derived path). Implement in order; do not skip the spike.

Functions with two or more parameters use object signatures (`({ a, b }: { a: A; b: B }) => …`) per `AGENTS.md`. Never use `as any`, `@ts-ignore`, or empty catch blocks. For desktop IPC, always go through tRPC (`apps/desktop/src/lib/trpc`).

### Spike 0 — Confirm the per-window context mechanism

Goal: prove we can determine which window made a tRPC call, so `window.setActiveOrg` can target the calling window. This resolves Q1/D1 and de-risks all of Milestone 2.

Approach (time-box ~1–2 hours, isolated, no production behavior change):

1. Ensure dependencies are installed so the library source can be read and run: from the repo root run `bun install`.
2. Read the installed library types to learn the `createIPCHandler` options:

       cat apps/desktop/node_modules/trpc-electron/dist/*.d.ts
       # Look for a `createContext` option and whether it receives the Electron IPC event
       # (a field typed like IpcMainInvokeEvent, or an object exposing `.sender`).

3. If `createContext` receives the event (or its `sender`), this confirms D1. Implement context as:

       // apps/desktop/src/lib/trpc/context.ts (new)
       import { BrowserWindow } from "electron";
       export interface TrpcContext {
         senderWindow: BrowserWindow | null;
       }
       // createContext maps the IPC event's sender WebContents to a BrowserWindow:
       //   ({ event }) => ({ senderWindow: BrowserWindow.fromWebContents(event.sender) })

4. Temporarily add a throwaway `window.debugWhoAmI` query that returns `ctx.senderWindow?.id ?? null`, open two windows by calling `MainWindow()` twice in a scratch branch (or via Milestone 1's helper), and confirm each window receives its **own** id.

Success criteria:

- Either: `createContext` exposes the sender event → adopt the context approach (preferred). Record D1 = "context via `BrowserWindow.fromWebContents(event.sender)`".
- Or (fallback): it does not → adopt the fallback, where the renderer learns its own window id once (a tiny preload-exposed value or a dedicated IPC round-trip at startup) and passes that id explicitly as input to `window.setActiveOrg({ windowId, organizationId })`. Record D1 = "explicit windowId input" and adjust Milestone 2 procedure signatures accordingly.

Remove the throwaway procedure before finishing the spike. Document findings in Surprises & Discoveries and finalize D1 in the Decision Log.

### Milestone 1 — Main-process refactor: app services vs per-window setup, plus a window registry

Scope: split `MainWindow()` so that one-time app services run once and per-window setup can run many times, and introduce a registry that tracks every open window. No user-visible change yet — the app still opens exactly one window and behaves as before.

What will exist that did not before: a `createPlatformWindow()` factory that can be safely called more than once, an `initAppServices()` run once at startup, and a window registry module that is the single source of truth for "which windows are open" and (later) "what org each shows".

Edits:

1. **New: `apps/desktop/src/main/lib/window-registry/window-registry.ts`.** A module holding `const registry = new Map<number, WindowEntry>()` where `WindowEntry = { window: BrowserWindow; orgId: string | null }`, keyed by `window.id` (the stable Electron `BrowserWindow.id`). Export:
   - `registerWindow({ window, orgId }: { window: BrowserWindow; orgId: string | null }): void`
   - `unregisterWindow(windowId: number): void`
   - `getEntry(windowId: number): WindowEntry | undefined`
   - `setOrg({ windowId, orgId }: { windowId: number; orgId: string | null }): void`
   - `getOrg(windowId: number): string | null`
   - `getAllWindows(): BrowserWindow[]`
   - `getFocusedOrLastWindow(): BrowserWindow | null` (prefers `BrowserWindow.getFocusedWindow()`, falls back to the most-recently-registered live window) — used by `focusMainWindow`, deep links, and notifications (D5).
   Add a co-located `window-registry.test.ts` covering register/unregister/setOrg/getOrg and focused-fallback selection (use plain objects with an `id` and an `isDestroyed()` stub rather than real `BrowserWindow`s).

2. **Refactor `apps/desktop/src/main/windows/main.ts`:**
   - Extract everything that must run **once** into `export function initAppServices(): void` — the notifications HTTP server `notificationsApp.listen(...)` (currently line 182), `NotificationManager` construction, the `notificationsEmitter` agent-lifecycle and terminal-exit listeners, and the GPU `child-process-gone` handler. The `NotificationManager`'s `onNotificationClick`/`getVisibilityContext` must no longer close over a single `window`; instead resolve the target via `windowRegistry.getFocusedOrLastWindow()` (D5).
   - Rename the per-window body to `export async function createPlatformWindow({ orgId, bounds }: { orgId: string | null; bounds?: WindowState }): Promise<BrowserWindow>`. It builds the `BrowserWindow` (reusing the existing options, including `partition: "persist:superset"`), calls `registerWindow({ window, orgId })`, attaches it to the IPC handler (create the handler on first call, `attachWindow` afterwards — keep the existing singleton pattern), wires per-window bounds persistence and the `close` handler. On `close`, call `unregisterWindow(window.id)` instead of `currentWindow = null`, and persist this window's state (Milestone 4 generalizes persistence).
   - Replace the module-level `let currentWindow` and `getWindow = () => currentWindow` with `const getWindow = () => windowRegistry.getFocusedOrLastWindow()`. This keeps the existing `createAppRouter(getWindow)` consumers (projects, notifications, ringtone, and the OS-control window procedures) working: they now act on the focused window. (Milestone 2 switches the window procedures to the precise per-call window from Spike 0's context.)
   - `createApplicationMenu()` should be called once from `initAppServices()` (the menu is global), not per window.

3. **Update `apps/desktop/src/main/index.ts`:** in the ready sequence (around line 428), call `initAppServices()` once, then `await makeAppSetup(() => createPlatformWindow({ orgId: null }))`. Update `focusMainWindow()` (line 110) and `processDeepLink()` (line 81) to target `windowRegistry.getFocusedOrLastWindow()` rather than `getAllWindows()[0]`.

Acceptance:

    bun run typecheck   # No errors
    bun run lint        # No errors
    bun test apps/desktop/src/main/lib/window-registry/window-registry.test.ts
    # Expected: all registry tests pass

    bun dev
    # The app opens exactly one window and works as before: sign in, see tasks,
    # switch org via the dropdown (still global at this milestone), minimize/close work.

Verify before proceeding: a single window still behaves exactly as today; no notifications port crash; closing the window cleans up the registry (add a temporary `console.log` of `windowRegistry.getAllWindows().length` on close if needed, then remove it).

### Milestone 2 — Per-window organization context

Scope: make each window hold its **own** org. The registry stores the org per window; new procedures read/set the calling window's org; the renderer reads its org from the window (not the shared session); API calls carry the `x-superset-organization-id` header for that window; switching org becomes window-local (no shared-session mutation). Still only one window opens (New Window UX is Milestone 3), so this milestone is validated by confirming the single window now drives its org through the window registry.

Edits (main process):

1. **`apps/desktop/src/lib/trpc/context.ts`** (from Spike 0): export `TrpcContext` and the `createContext` used by `createIPCHandler`.
2. **`apps/desktop/src/main/windows/main.ts`:** when creating the IPC handler, pass `createContext`. 
3. **`apps/desktop/src/lib/trpc/routers/window.ts`:** add procedures (signatures depend on D1; shown here for the preferred context approach):
   - `getActiveOrg: publicProcedure.query(({ ctx }) => ctx.senderWindow ? windowRegistry.getOrg(ctx.senderWindow.id) : null)`
   - `setActiveOrg: publicProcedure.input(z.object({ organizationId: z.string() })).mutation(({ ctx, input }) => { if (ctx.senderWindow) windowRegistry.setOrg({ windowId: ctx.senderWindow.id, orgId: input.organizationId }); return { success: true }; })`
   - `openNew: publicProcedure.mutation(async ({ ctx }) => { const orgId = ctx.senderWindow ? windowRegistry.getOrg(ctx.senderWindow.id) : null; await createPlatformWindow({ orgId }); return { success: true }; })` (used by Milestone 3; defined here alongside the others).
   - Convert the existing OS-control procedures (`minimize`, `maximize`, `close`, `isMaximized`, `selectDirectory`, `selectImageFile`) to use `ctx.senderWindow` instead of the global `getWindow()`, so they always act on the calling window. (If D1 is the fallback "explicit windowId" approach, these keep `getWindow()` and only the org procedures take a `windowId` input.)

Edits (renderer):

4. **`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`:** add a per-renderer module-level org id mirroring the `auth-client.ts` token pattern:

       let currentOrgId: string | null = null;
       export function setCurrentOrgId(id: string | null) { currentOrgId = id; }
       export function getCurrentOrgId(): string | null { return currentOrgId; }

   Then include the header in the `apiClient` `headers()` (lines 219-238):

       headers: () => {
         const token = getAuthToken();
         const orgId = getCurrentOrgId();
         return {
           ...(token ? { Authorization: `Bearer ${token}` } : {}),
           ...(orgId ? { [ORGANIZATION_HEADER]: orgId } : {}),
         };
       },

   Import `ORGANIZATION_HEADER` from `@superset/shared/constants`. Electric collections already carry `organizationId` via shape params, so no change there.

5. **`apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`:** make the window registry the source of truth, with the session as the initial fallback (D3):
   - Read the window org: `const { data: windowOrgId } = trpc.window.getActiveOrg.useQuery()`.
   - Compute the effective org once: `const activeOrganizationId = env.SKIP_ENV_VALIDATION ? MOCK_ORG_ID : (windowOrgId ?? session?.session?.activeOrganizationId ?? null)`.
   - In an effect, when `activeOrganizationId` is set, call `setCurrentOrgId(activeOrganizationId)` (so API headers are correct) and, if `windowOrgId` was null, persist the fallback once via `trpc.window.setActiveOrg.useMutation()` so the registry (and Milestone 4 restore) knows it.
   - Rewrite `switchOrganization` to be window-local: set local React state, call `setCurrentOrgId(organizationId)`, `await trpc.window.setActiveOrg.mutate({ organizationId })`, and `await preloadCollections(organizationId)`. **Remove** the `authClient.organization.setActive(...)` and `refetchSession()` calls — switching must not touch the shared session.
   - Hold the active org in local state seeded from the query so the UI updates immediately on switch.

6. **`apps/desktop/src/renderer/routes/_authenticated/layout.tsx`:** replace the session read (lines 66-68) with the same window-org resolution (read `trpc.window.getActiveOrg`, fall back to session) so the `/create-organization` redirect (lines 197-199) is based on the window's org. Keep cache-first rendering rules from `AGENTS.md` (rule 9) in mind: render existing data first; only use readiness to decide what to show when there is no data.

7. **`OrganizationDropdown.tsx`:** no change needed to the switch wiring — it still calls `collections.switchOrganization(...)`, which is now window-local. (It reads `session.session.activeOrganizationId` for the checkmark at line 40; change that to the provider's active org so the check mark reflects the **window's** org, not the session's.)

Acceptance:

    bun run typecheck && bun run lint && bun test
    # Expected: green

    bun dev
    # Sign in. Switch org via the dropdown. Confirm:
    #  - the task/project lists change to the new org (window-local switch works),
    #  - network calls to the cloud API include header `x-superset-organization-id`
    #    (inspect via the dev Network panel or a temporary log in apiClient.headers()).
    #  - the Better Auth session's activeOrganizationId is NOT changed by switching
    #    (it only changes the window's org now).

Verify before proceeding: a single window now sources its org from the registry and sends the org header; switching no longer mutates the shared session.

### Milestone 3 — New Window UX (Cmd+N, menu, optional dropdown action, per-window title)

Scope: let the user open additional windows and tell them apart.

Edits:

1. **`apps/desktop/src/main/lib/menu.ts`:** add to the top of the `File` submenu (before "Open Repo…", lines 22-29):

       {
         label: "New Window",
         accelerator: "CmdOrCtrl+N",
         click: () => {
           const focused = windowRegistry.getFocusedOrLastWindow();
           const orgId = focused ? windowRegistry.getOrg(focused.id) : null;
           void createPlatformWindow({ orgId });
         },
       },
       { type: "separator" },

   (The menu handler runs in the main process and can call `createPlatformWindow` directly, so it does not need the tRPC `window.openNew`. Keep `window.openNew` for the renderer dropdown action below.)

2. **Per-window title (A2):** in `CollectionsProvider.tsx` (or a small dedicated effect near where the active org and the live `organizations` collection are available), set `document.title = \`${activeOrgName} — Superset\`` whenever the window's active org (and its name) is known. If A2 proves false (window title does not follow `document.title`), add `setTitle: publicProcedure.input(z.object({ title: z.string() })).mutation(({ ctx, input }) => { ctx.senderWindow?.setTitle(input.title); return { success: true }; })` to `window.ts` and call it from the renderer instead.

3. **Optional org-dropdown action (Q3/D4):** in `OrganizationDropdown.tsx`, add an "Open in new window" item per org (or a single one for the current org) that calls a new `trpc.window.openNew.useMutation()`. Because `openNew` opens with the **caller's** current org, to open a *specific* other org in a new window, extend `openNew` to accept an optional `organizationId` input and seed the new window's registry entry with it. Decide D4 during implementation; if cut, omit this edit (Cmd+N still satisfies the goal).

Acceptance:

    bun dev
    # 1) Press Cmd+N -> a second window opens on the same org as the first.
    # 2) In window 2, switch org via the dropdown to a different org.
    #    -> window 1 is UNCHANGED (its tasks/projects/sidebar stay on org A).
    # 3) Each window's title (macOS Mission Control / Window menu) reads
    #    "<Org Name> — Superset" for its own org.

Verify before proceeding: two windows, two orgs, fully independent; titles distinguish them.

### Milestone 4 — Restore all windows on relaunch

Scope: persist each open window's org and bounds, and recreate them at startup.

Edits:

1. **`apps/desktop/src/main/lib/window-state/window-state.ts`:** keep the existing single `WindowState` shape and add a sibling persisted structure for the set of windows: `interface PersistedWindow { orgId: string | null; state: WindowState }` and `loadWindows(): PersistedWindow[]` / `saveWindows(windows: PersistedWindow[]): void`, written atomically (temp file + rename) like the existing `saveWindowState`. Provide a migration: if the new file is absent but the legacy single-record file exists, return `[{ orgId: null, state: <legacy> }]` so existing users keep their window position. Update `window-state.test.ts` for the new functions and the migration.
2. **`apps/desktop/src/main/windows/main.ts`:** on each window's `close` and on bounds changes, write the **set** of currently-open windows (each entry = its registry org + current bounds) via `saveWindows(...)`. Add `export async function restoreWindows(): Promise<void>` that reads `loadWindows()` and calls `createPlatformWindow({ orgId, bounds: state })` for each; if the list is empty, do nothing (so `makeAppSetup` creates the default single window).
3. **`apps/desktop/src/main/index.ts`:** pass `restoreWindows` as the second argument to `makeAppSetup` (its signature already supports `restoreWindows?: () => Promise<void>`, see `setup.ts:12`): `await makeAppSetup(() => createPlatformWindow({ orgId: null }), restoreWindows)`.

Acceptance:

    bun dev
    # Open two windows on two different orgs, position them, then Quit the app.
    # Relaunch (bun dev again, or relaunch the built app).
    # -> Both windows reopen, each on its previous org and screen position.

    bun test apps/desktop/src/main/lib/window-state/window-state.test.ts
    # Expected: pass, including the legacy->new migration case.


## Concrete Steps

Run from the repo root unless noted. First-time environment setup is described in `DEVELOPMENT.md` (requires Docker running and `caddy trust` once). Then:

    bun install
    # Installs workspace deps, including trpc-electron (needed for Spike 0).

    # Spike 0: inspect the library context API
    cat apps/desktop/node_modules/trpc-electron/dist/*.d.ts
    # Look for `createContext` and whether it receives the IPC event / sender.

    # After each milestone:
    bun run typecheck
    # Expected: "No errors" (tsc completes with no diagnostics)
    bun run lint
    # Expected: Biome reports no errors/warnings (CI treats warnings as errors)
    bun test
    # Expected: all suites pass

    # Manual run:
    bun dev
    # Electron window opens; sign in with admin@local.test / supersetdev

Always run `bun run lint:fix` after edits and confirm `bun run lint` exits 0 before pushing (root `AGENTS.md` rule 7: CI fails on warnings). For desktop, also run:

    bun run lint:check-node-imports
    # Expected: no Node.js imports leaked into renderer code


## Validation and Acceptance

The feature is acceptable when all of the following hold:

- Behavioral (manual, `bun dev`):
  - Cmd+N opens a second independent window on the current org.
  - Switching org in one window does not change any other window, and does not change the Better Auth session's `activeOrganizationId`.
  - Each window's title reads `<Org Name> — Superset`.
  - Quit-with-multiple-windows then relaunch restores every window on its org and position.
  - Cloud API requests carry `x-superset-organization-id` equal to the window's org (verify in the dev Network panel).
- Automated:
  - `bun run typecheck` → no type errors.
  - `bun run lint` → no errors or warnings.
  - `bun test` → all pass, including new `window-registry` tests and updated `window-state` tests.


## Idempotence and Recovery

- All edits are code edits and safe to re-run; re-running `bun run typecheck/lint/test` is non-destructive.
- The window-state migration is read-then-write: if the new multi-window file already exists it is used as-is; the legacy single-record file is only read as a fallback and never deleted, so a downgrade still finds it.
- If Spike 0 shows `trpc-electron` cannot expose the sender (D1 fallback), only the procedure signatures in Milestone 2/3 change (add an explicit `windowId` input sourced once at renderer startup); the rest of the plan is unchanged.
- If a refactor in Milestone 1 breaks single-window behavior, revert to the previous commit for `apps/desktop/src/main/windows/main.ts` and re-apply incrementally; the milestone is independently testable, so bisecting is cheap.


## Artifacts and Notes

Representative target diff for the API header (Milestone 2, `collections.ts`):

    // before
    headers: () => {
      const token = getAuthToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },

    // after
    headers: () => {
      const token = getAuthToken();
      const orgId = getCurrentOrgId();
      return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { [ORGANIZATION_HEADER]: orgId } : {}),
      };
    },

Representative File-menu addition (Milestone 3, `menu.ts`):

    submenu: [
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+N",
        click: () => {
          const focused = windowRegistry.getFocusedOrLastWindow();
          const orgId = focused ? windowRegistry.getOrg(focused.id) : null;
          void createPlatformWindow({ orgId });
        },
      },
      { type: "separator" },
      { label: "Open Repo...", accelerator: "CmdOrCtrl+O", click: () => { menuEmitter.emit("open-project"); } },
      // …existing items…
    ]


## Interfaces and Dependencies

No new third-party libraries. Use only what the repo already depends on (`electron`, `trpc-electron`, `@trpc/*`, `zod`, `superjson`).

New/changed interfaces (final shapes; `windowId` inputs apply only if Spike 0 selects the fallback):

    // apps/desktop/src/lib/trpc/context.ts (new)
    export interface TrpcContext {
      senderWindow: import("electron").BrowserWindow | null;
    }

    // apps/desktop/src/main/lib/window-registry/window-registry.ts (new)
    export interface WindowEntry {
      window: import("electron").BrowserWindow;
      orgId: string | null;
    }
    export function registerWindow(args: { window: BrowserWindow; orgId: string | null }): void;
    export function unregisterWindow(windowId: number): void;
    export function setOrg(args: { windowId: number; orgId: string | null }): void;
    export function getOrg(windowId: number): string | null;
    export function getAllWindows(): BrowserWindow[];
    export function getFocusedOrLastWindow(): BrowserWindow | null;

    // apps/desktop/src/lib/trpc/routers/window.ts (added procedures)
    // getActiveOrg(): string | null
    // setActiveOrg({ organizationId: string }): { success: boolean }
    // openNew(): { success: boolean }                 // opens a window on the caller's org
    //   (optionally openNew({ organizationId?: string }) if D4 ships the dropdown action)

    // apps/desktop/src/main/windows/main.ts (changed exports)
    export function initAppServices(): void;
    export function createPlatformWindow(args: { orgId: string | null; bounds?: WindowState }): Promise<BrowserWindow>;
    export function restoreWindows(): Promise<void>;

    // apps/desktop/src/renderer/.../collections.ts (added)
    export function setCurrentOrgId(id: string | null): void;
    export function getCurrentOrgId(): string | null;

    // apps/desktop/src/main/lib/window-state/window-state.ts (added)
    export interface PersistedWindow { orgId: string | null; state: WindowState }
    export function loadWindows(): PersistedWindow[];
    export function saveWindows(windows: PersistedWindow[]): void;

Dependencies between milestones: Spike 0 → Milestone 1 → Milestone 2 → Milestone 3 → Milestone 4. Milestones 1 and 2 keep single-window behavior; Milestone 3 is the first user-visible change; Milestone 4 adds persistence.


## Change Log (for this plan)

- 2026-06-23: Initial plan authored from the locked design (issue #4018, option 3b). Captured the single-window "god function" constraint, the renderer org touchpoints, and the existing cloud org header. Added Spike 0 because `trpc-electron@0.1.2`'s per-window context mechanism cannot be confirmed from source until `bun install` runs, and because the dev window loader ignores URL query params (so org must be delivered over IPC, not via URL).
- 2026-06-23 (07:34Z): Spike 0 complete. Confirmed D1 — `trpc-electron@0.1.2` exposes the IPC sender via `createContext({ event })`, so per-window routing uses `ctx.senderWindow = BrowserWindow.fromWebContents(event.sender)`; the explicit-`windowId` fallback is dropped. Updated Assumptions (A1), Open Questions (Q1), Progress, Decision Log (D1), and Surprises & Discoveries accordingly. Milestone 2/3 procedure signatures are the context form (no `windowId` inputs). Ready to begin Milestone 1 on approval.
