# Port v2 "Hide Attach" Terminal Pattern into v1 Renderer

## Context

When switching tabs in v1, `TabsContent` renders only the active tab (`TabsContent/index.tsx:92`). The old `TabView` unmounts entirely, cascading to all `Terminal` components. The cleanup in `useTerminalLifecycle.ts` (lines 854-916) **disposes the entire xterm instance**, sends a backend detach, and nulls all refs. On remount, a brand new xterm is created from scratch, `createOrAttach` restores scrollback from the backend, and all addons/handlers re-initialize. This causes a visible flash and delay.

V2 solves this with `terminal-runtime.ts` + `terminal-runtime-registry.ts`: xterm is opened into a persistent wrapper `<div>`, and tab switching just moves the wrapper in/out of the DOM. The xterm stays alive in memory, so reattach is instant.

The existing **Terminal Persistence DX Hardening plan** (`apps/desktop/plans/20260107-1107-terminal-persistence-dx-hardening.md`) already identifies this problem and proposes an LRU warm set with `visibility: hidden`. Our approach is a cleaner alternative: DOM detach/reattach (the v2 pattern), which avoids WebGL texture atlas corruption issues that come from CSS-hidden terminals.

## Approach

Create a **v1 terminal instance cache** — a module-level `Map<paneId, CachedTerminal>` that stores xterm instances across React mount/unmount cycles. This borrows the wrapper-div pattern from `terminal-runtime.ts` but stays v1-specific (v1's tRPC communication, link providers, keyboard handling, and addon loading are different from v2's WebSocket-based registry).

### Duplication is fine

V1 and v2 will diverge wildly. This is a hotfix for v1 while v2 is still coming out. We freely duplicate whatever we need from v2's runtime code into v1's Terminal directory — no shared abstractions or imports from `renderer/lib/terminal/`.

## File Changes

### 1. NEW: `Terminal/v1-terminal-cache.ts`

Module-level singleton cache managing xterm instance lifecycle independently from React.

```typescript
interface CachedTerminal {
  xterm: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  rendererRef: TerminalRendererRef;
  wrapper: HTMLDivElement;
  cleanupCreation: () => void;  // disposes renderer RAF, query suppression, etc.
}

const cache = new Map<string, CachedTerminal>();
```

Methods:
- **`has(paneId)`** — check for existing instance
- **`getOrCreate(paneId, options)`** — returns existing or creates new xterm in a wrapper div
- **`attachToContainer(paneId, container)`** — `container.appendChild(wrapper)`, fit, refresh, clear texture atlas
- **`detachFromContainer(paneId)`** — `wrapper.remove()` (keeps xterm alive in memory)
- **`dispose(paneId)`** — full cleanup: `cleanupCreation()`, `xterm.dispose()`, delete from cache

### 2. MODIFY: `Terminal/helpers.ts` — `createTerminalInstance`

Split into two phases:
- **Phase 1** (`createTerminalInWrapper`): Creates XTerm, opens into a new wrapper `<div>` (not the container), loads addons. Returns `{ xterm, fitAddon, rendererRef, wrapper, cleanup }`.
- **Phase 2**: Caller appends wrapper to container.

The existing `createTerminalInstance(container, options)` becomes a convenience wrapper that calls Phase 1 + appends to container, so no other callers break.

Key change: line 209 `xterm.open(container)` becomes `xterm.open(wrapper)` in the new function.

### 3. MODIFY: `Terminal/hooks/useTerminalLifecycle.ts` — Main lifecycle hook

This is the largest change, concentrated in the single `useEffect` body.

**Mount (lines ~221-280) — replace xterm creation with cache:**

```typescript
const isReattach = v1TerminalCache.has(paneId);
const cached = v1TerminalCache.getOrCreate(paneId, { ... });
const { xterm, fitAddon, rendererRef: renderer } = cached;

// Attach wrapper to live container
v1TerminalCache.attachToContainer(paneId, container);
```

On reattach:
- Set `didFirstRenderRef.current = true` immediately (xterm already rendered)
- Set `searchAddonRef.current` from cache instead of creating new
- Still call `createOrAttach` via `scheduleTerminalAttach` to re-establish backend session (tRPC subscription was killed on unmount)
- Skip writing scrollback to xterm in the `onSuccess` handler since buffer is already in memory

Event handler setup (keyboard, paste, copy, focus, resize, click-to-move) still runs fresh each mount — these are ephemeral and depend on React refs.

**Unmount cleanup (lines 854-916):**

Replace pane-not-destroyed path:
```typescript
if (paneDestroyed) {
  killTerminalForPane(paneId);
  coldRestoreState.delete(paneId);
  pendingDetaches.delete(paneId);
  v1TerminalCache.dispose(paneId);  // full disposal
} else {
  v1TerminalCache.detachFromContainer(paneId);  // keep xterm alive
  // Still send backend detach after 50ms (existing pendingDetaches pattern)
  const detachTimeout = setTimeout(() => {
    detachRef.current({ paneId });
    pendingDetaches.delete(paneId);
    coldRestoreState.delete(paneId);
  }, 50);
  pendingDetaches.set(paneId, detachTimeout);
}
```

Remove: `setTimeout(() => xterm.dispose(), 0)` — the cache owns disposal now.

### 4. NO CHANGES to `Terminal/hooks/useTerminalRestore.ts`

The reattach skip is handled entirely in `useTerminalLifecycle.ts`'s `createOrAttach` `onSuccess` handler. On reattach, instead of setting `pendingInitialStateRef.current = result` and calling `maybeApplyInitialState()`, we directly:
- Set `isStreamReadyRef.current = true`
- Call `flushPendingEvents()`
- Skip scrollback writing (buffer already in xterm memory)

Cold restore still goes through the normal `maybeApplyInitialState` path since the cache is empty on fresh app start.

### 5. NO CHANGES to `Terminal/Terminal.tsx`

The tRPC subscription (`electronTrpc.terminal.stream.useSubscription`) still ties to React lifecycle — stops on unmount, restarts on remount. The backend buffers data during the gap, and `createOrAttach` returns it. Theme/font changes already apply on mount via existing `useEffect` hooks.

### 6. NO CHANGES to `Terminal/state.ts`

`pendingDetaches` and `coldRestoreState` continue working as before. The `pendingDetaches` cancel-on-remount pattern (lines 229-234) is still needed for React StrictMode.

## Edge Cases

| Case | Handling |
|------|----------|
| **Theme change while detached** | Existing `useEffect` in Terminal.tsx sets `xterm.options.theme` on mount |
| **Font change while detached** | Existing `useEffect` applies font settings + refits on mount |
| **WebGL context loss while detached** | `attachToContainer` calls `clearTextureAtlas()` + `refresh()` |
| **React StrictMode double-mount** | `pendingDetaches` cancel-on-remount handles this (existing pattern) |
| **Stream data gap** | Backend buffers; `createOrAttach` sends scrollback (discarded on reattach since buffer is in memory); stream subscription resumes |
| **Container resize while detached** | `fitAddon.fit()` runs during `attachToContainer` |
| **Many cached terminals (memory)** | Same tradeoff v2 makes. Browsers limit WebGL contexts (~8-16); existing context-loss handler falls back to DOM rendering |
| **Cold restore after reboot** | Not a reattach case — cache is empty on fresh start. Handled normally. |
| **Workspace-run pane restart** | `restartTerminalSession` in useTerminalLifecycle works the same — it uses the cached xterm |

## Verification

1. **Tab switch**: switch away and back — terminal should not flash/flicker
2. **Buffer preservation**: scroll up in terminal, switch tab, switch back — scroll position preserved
3. **Theme change**: switch tab, change theme, switch back — terminal has new theme
4. **Close pane**: close a terminal pane — fully disposed (no memory leak)
5. **StrictMode**: dev mode double-mount/unmount should not cause issues
6. **Cold restore**: restart the app — cold restore still works (cache empty on fresh start)
7. **Heavy splits**: 4-way split tab, switch away and back — all terminals reattach

```bash
bun run typecheck
bun run lint:fix
bun test
```

## Critical Files

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts`
- NEW: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache.ts`

## Reference Implementation

- `apps/desktop/src/renderer/lib/terminal/terminal-runtime.ts` — wrapper div pattern, `attachToContainer`, `detachFromContainer`, `disposeRuntime`
- `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts` — singleton registry pattern
- `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` — v2 addon loading (reference for WebGL handling)
