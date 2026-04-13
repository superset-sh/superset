# Simplify v1 Terminal Resize to Match v2 Behavior

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template at `.agents/commands/create-plan.md`. It continues the work started in `apps/desktop/plans/20260410-port-v2-hide-attach-to-v1.md`, which ported the wrapper-div pattern and terminal cache from v2 into v1.

## Purpose / Big Picture

After the hide-attach pattern was ported from v2 to v1, v1 terminals still carry legacy resize infrastructure that v2 never needed. V1 debounces resize events at 150ms, listens to both `ResizeObserver` and `window.resize`, does scroll preservation in the resize handler, runs `fitAddon.fit()` twice on reattach, and manages the `ResizeObserver` lifecycle from the React component instead of the cache. V2 does none of this: it creates a plain `ResizeObserver` in `attachToContainer()`, tears it down in `detachFromContainer()`, and calls `measureAndResize()` with no debounce, no window listener, and no scroll logic.

After this change, v1 resize behavior will match v2: a single undebounced `ResizeObserver` managed by the cache, one `fitAddon.fit()` call on reattach, and no scroll preservation in the resize path. The user-visible effect is a simpler, more responsive resize that eliminates the 150ms lag on every pane or window resize.

## Assumptions

1. The `ResizeObserver` fires on all container size changes, including those caused by window resize. Therefore the separate `window.addEventListener("resize")` listener in v1 is redundant. (This is well-established browser behavior and is what v2 relies on.)

2. Scroll preservation on resize (the `wasAtBottom` check in v1's `setupResizeHandlers`) is not needed. V2 ships without it and no regressions have been reported. Xterm.js itself may handle this internally in recent versions.

3. Removing the 150ms debounce will not cause excessive backend resize IPC calls. V2 runs without debounce and the PTY backend handles rapid resize fine. If needed, a much smaller debounce (e.g. via `requestAnimationFrame` coalescing like v2's `measureAndResize`) can be added later.

## Open Questions

None at this time. The v2 implementation serves as a proven reference.

## Progress

- [x] (2026-04-11) Milestone 1: Move ResizeObserver into the cache (attach/detach)
- [x] (2026-04-11) Milestone 2: Remove duplicate reattach resize from useTerminalLifecycle
- [x] (2026-04-11) Milestone 3: Remove setupResizeHandlers and window resize listener
- [x] (2026-04-11) Milestone 4: Validation (typecheck, lint pass)
- [x] (2026-04-11) Milestone 5: Wrap Terminal in React.memo to prevent re-renders during split resize

## Surprises & Discoveries

- Observation: V1 split resize goes through React state on every mouse-move pixel (store update → full component tree re-render → Mosaic repositioning), unlike v2 which is CSS-only via ResizablePanel. The terminal component doesn't remount (Mosaic uses stable `key={paneId}` in `MosaicRoot.js:72`), but it re-renders through the entire tree. Wrapping Terminal in `React.memo` prevents the xterm subtree from re-rendering since its props (`paneId`, `tabId`, `workspaceId`) are stable strings.
  Evidence: react-mosaic-component `MosaicRoot.renderRecursively()` calls `renderTile()` on every render but uses `key: node` (the pane ID string) on tile divs, preserving component identity. The reverted commit 918e8f062 tried stabilizing `layoutPaneIds` but that only cut one link — `Mosaic value={}` still gets a new prop per pixel.

## Decision Log

- Decision: Duplication from v2 is acceptable.
  Rationale: Per the hide-attach plan, v1 and v2 will diverge. We copy the pattern rather than share code across `renderer/lib/terminal/` and the v1 Terminal directory.
  Date/Author: 2026-04-11

## Outcomes & Retrospective

(To be filled on completion.)

## Context and Orientation

This work affects only the desktop app (`apps/desktop`), specifically the v1 terminal renderer.

### Key files

**V1 terminal (what we are changing):**

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache.ts` — The module-level cache that stores xterm instances across React mount/unmount cycles. Currently its `attachToContainer()` calls `fitAddon.fit()` and `xterm.refresh()` but does NOT create a `ResizeObserver`. After this plan, it will own the `ResizeObserver` lifecycle.

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts` — Contains `setupResizeHandlers()` (lines 730-755), which creates a debounced `ResizeObserver` + `window.resize` listener. This function will be removed.

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts` — The React lifecycle hook. Currently calls `setupResizeHandlers()` on mount (line 781) and does a duplicate `fitAddon.fit()` on reattach (lines 522-535). Both will be removed.

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config.ts` — Defines `RESIZE_DEBOUNCE_MS = 150`. This constant will be removed.

**V2 terminal (reference implementation, no changes):**

- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` — V2's `attachToContainer()` (lines 174-195) is the model. It creates a `ResizeObserver` inline, calls `measureAndResize()`, and stores the observer on the runtime. `detachFromContainer()` disconnects it. No debounce. No window listener. No scroll preservation.

### Terminology

- **ResizeObserver**: A browser API that fires a callback whenever a DOM element's size changes. It detects container resizes regardless of cause (window resize, pane drag, sidebar toggle).
- **FitAddon**: An xterm.js addon that recalculates terminal column/row dimensions to fill its container. `fitAddon.fit()` reads the container's pixel dimensions and updates the xterm grid accordingly.
- **Reattach**: When a cached v1 terminal is moved back into the DOM after a tab switch. The xterm instance was never disposed — only its wrapper `<div>` was removed from the DOM.

## Plan of Work

### Milestone 1: Move ResizeObserver into the cache

Add a `resizeObserver` field to `CachedTerminal` in `v1-terminal-cache.ts` and an `onResize` callback field. Create the observer in `attachToContainer()` and disconnect it in `detachFromContainer()`, matching v2's `terminal-runtime.ts` pattern.

**File: `v1-terminal-cache.ts`**

Add to `CachedTerminal` interface:

    resizeObserver: ResizeObserver | null;

In `getOrCreate()`, initialize:

    resizeObserver: null,

Rewrite `attachToContainer()` to accept an `onResize` callback and create a `ResizeObserver`:

    export function attachToContainer(
      paneId: string,
      container: HTMLDivElement,
      onResize?: () => void,
    ): void {
      const entry = cache.get(paneId);
      if (!entry) return;

      container.appendChild(entry.wrapper);
      entry.fitAddon.fit();
      entry.xterm.refresh(0, Math.max(0, entry.xterm.rows - 1));
      entry.rendererRef.current.clearTextureAtlas?.();

      // Manage ResizeObserver lifecycle in the cache, not in React.
      entry.resizeObserver?.disconnect();
      const observer = new ResizeObserver(() => {
        if (container.clientWidth === 0 && container.clientHeight === 0) return;
        entry.fitAddon.fit();
        onResize?.();
      });
      observer.observe(container);
      entry.resizeObserver = observer;
    }

Update `detachFromContainer()` to disconnect the observer:

    export function detachFromContainer(paneId: string): void {
      const entry = cache.get(paneId);
      if (!entry) return;

      entry.resizeObserver?.disconnect();
      entry.resizeObserver = null;
      entry.wrapper.remove();
    }

Update `dispose()` to also disconnect:

    export function dispose(paneId: string): void {
      const entry = cache.get(paneId);
      if (!entry) return;

      entry.resizeObserver?.disconnect();
      entry.subscription?.unsubscribe();
      entry.cleanupCreation();
      entry.xterm.dispose();
      cache.delete(paneId);
    }

### Milestone 2: Remove duplicate reattach resize from useTerminalLifecycle

In `useTerminalLifecycle.ts`, the reattach branch (lines 518-535) currently does:

    if (isReattach) {
      isStreamReadyRef.current = true;
      requestAnimationFrame(() => {
        if (isUnmounted) return;
        const prevCols = xterm.cols;
        const prevRows = xterm.rows;
        fitAddon.fit();
        if (xterm.cols !== prevCols || xterm.rows !== prevRows) {
          resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
        }
      });
    }

This is redundant because `attachToContainer()` already calls `fitAddon.fit()` and the new `ResizeObserver` will fire immediately if the container size differs. Remove the `requestAnimationFrame` block. The reattach branch becomes:

    if (isReattach) {
      isStreamReadyRef.current = true;
    }

Similarly, in the first-mount `onSuccess` handler (lines 626-637), there is another rAF block that calls `fitAddon.fit()` after `createOrAttach` succeeds. This is also redundant since `attachToContainer()` already fitted and the `ResizeObserver` handles subsequent changes. Remove it.

### Milestone 3: Remove setupResizeHandlers and window resize listener

**File: `helpers.ts`**

Delete the `setupResizeHandlers()` function (lines 730-755) entirely. It is no longer called by any code.

Remove the `debounce` import from lodash if it becomes unused. Remove the `RESIZE_DEBOUNCE_MS` import from `./config`.

**File: `config.ts`**

Remove the `RESIZE_DEBOUNCE_MS` constant (line 45). If it is not imported anywhere else, this is safe.

**File: `useTerminalLifecycle.ts`**

Remove the call to `setupResizeHandlers()` (lines 781-786):

    const cleanupResize = setupResizeHandlers(
      container,
      xterm,
      fitAddon,
      (cols, rows) => resizeRef.current({ paneId, cols, rows }),
    );

Remove `cleanupResize()` from the unmount cleanup (line 825).

Remove the `setupResizeHandlers` import from the helpers import block.

Update the `attachToContainer` call (line 260) to pass the resize callback:

    v1TerminalCache.attachToContainer(paneId, container, () => {
      resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
    });

Remove the `scrollToBottom` import from `../utils` if it becomes unused in this file (it may still be used elsewhere in the file for `scheduleScrollToBottom`).

### Milestone 4: Validation

Run:

    cd apps/desktop
    bun run typecheck   # No type errors
    bun run lint:fix    # No lint errors
    bun test            # All tests pass

Manual testing:

1. **Window resize**: Drag the app window larger and smaller. Terminal content should reflow immediately with no 150ms lag.
2. **Pane resize via splitter**: Drag a split pane divider. Terminal should reflow smoothly.
3. **Tab switch + resize**: Switch to another tab, resize the window, switch back. Terminal should show correct dimensions.
4. **Close pane**: Close a terminal pane. No console errors, no leaked observers.
5. **Multiple terminals**: Open 3+ terminals in splits. Resize window. All terminals reflow correctly.

## Concrete Steps

    cd apps/desktop

    # After all edits:
    bun run typecheck
    # Expected: No errors

    bun run lint:fix
    # Expected: No lint errors (or only auto-fixed)

    bun test
    # Expected: All tests pass

## Validation and Acceptance

Start the desktop app in dev mode and verify:

    bun dev

1. Open a terminal, run a command that produces output (e.g. `ls -la`). Resize the window by dragging. Terminal content should reflow immediately — there should be no perceptible 150ms delay.
2. Split the terminal pane. Drag the splitter. Both terminals should resize smoothly.
3. Switch to a different tab, resize the window, switch back. The terminal should display at the correct size.
4. Close a terminal pane. Check the console for errors — there should be no "ResizeObserver" related warnings.
5. Open DevTools, check that no `window.resize` event listeners are registered by terminal code.

## Idempotence and Recovery

All changes are code deletions and refactors. They can be reverted with `git checkout` on the affected files. No migrations, no schema changes, no state format changes.

## Interfaces and Dependencies

No new dependencies. The `ResizeObserver` is a standard browser API available in all Electron versions Superset targets.

The `lodash.debounce` import in `helpers.ts` may become unused after removing `setupResizeHandlers`. If so, it should be removed. The `lodash` package itself is used elsewhere and should not be uninstalled.

## Critical Files

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config.ts`

## Reference Implementation

- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` — V2's `attachToContainer()` (lines 174-195), `detachFromContainer()` (lines 197-204), and `measureAndResize()` (lines 127-132) are the model for the simplified v1 approach.
