# V2 Browser Refactor Plan

## Context

The Superset desktop browser has three major problems: (1) browser panes reload when switching tabs (#3076, #3040, #1834), (2) MCP tools cannot control browser pane content -- they only automate the Superset app UI (#1801), and (3) there's no element selection mechanism for LLMs (#2551). This plan addresses all three with a phased refactor.

---

## Phase 1: Fix Browser Tab Reload Bug

**Goal**: Eliminate unwanted webview reloads on tab switch.

### Root Cause

`TabsContent` renders only the active tab:

```tsx
// apps/desktop/src/renderer/.../TabsContent/index.tsx:92-93
{tabToRender ? <TabView tab={tabToRender} /> : <EmptyTabView />}
```

Switching tabs unmounts the entire `TabView` → unmounts `BrowserPane` → `usePersistentWebview` cleanup parks the webview in a hidden offscreen container → switching back remounts everything → webview is reclaimed via DOM reparenting → Electron may create a new backing store (the code explicitly checks for `webContentsId` changes in `handleDomReady`).

### Step 1.1: Render all workspace tabs, hide inactive ones

**File**: `apps/desktop/src/renderer/.../TabsContent/index.tsx`

Change from rendering a single `TabView` to rendering all tabs for the active workspace, with inactive tabs hidden via `display: none`:

```tsx
const workspaceTabs = allTabs.filter(t => t.workspaceId === activeWorkspaceId);

return (
  <div ref={contentRef} className="flex-1 min-h-0 flex overflow-hidden">
    {workspaceTabs.length === 0 && <EmptyTabView ... />}
    {workspaceTabs.map(tab => (
      <div
        key={tab.id}
        style={{ display: tab.id === activeTabId ? 'contents' : 'none' }}
      >
        <TabView tab={tab} />
      </div>
    ))}
  </div>
);
```

This prevents `BrowserPane` from unmounting on tab switch. The webview stays in place -- no reparenting, no `webContentsId` change, no reload.

**Memory mitigation**: Add a max-mounted-tabs threshold (e.g., 6). If exceeded, unmount the least-recently-used tabs. This bounds memory while keeping the most relevant tabs alive.

### Step 1.2: Simplify `usePersistentWebview`

**File**: `apps/desktop/src/renderer/.../BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts`

With Step 1.1 in place, the hidden container parking becomes a fallback rather than the primary mechanism. Simplify:

- Fix hidden container dimensions: `100vw x 100vh` → `1px x 1px` with `overflow: hidden`
- The cleanup effect now only fires on pane deletion (not tab switch), making it simpler
- Keep the registry for cross-workspace tab switches where unmounting is still necessary

### Step 1.3: Add telemetry for webContentsId changes

**File**: `apps/desktop/src/renderer/.../usePersistentWebview.ts` (in `handleDomReady`)

Log when `webContentsId` changes to validate the fix:

```typescript
if (previousId !== webContentsId) {
  console.warn(`[browser] webContentsId changed for pane ${paneId}: ${previousId} → ${webContentsId}`);
  // ... existing re-registration logic
}
```

### Files Modified (Phase 1)

| File | Change |
|------|--------|
| `apps/desktop/src/renderer/.../TabsContent/index.tsx` | Render all workspace tabs, hide inactive |
| `apps/desktop/src/renderer/.../usePersistentWebview.ts` | Fix hidden container to `1px x 1px`, add telemetry |

---

## Phase 2: Bridge MCP Tools to Browser Panes

**Goal**: Let AI agents click, type, hover, scroll, inspect DOM, and wait for elements in browser pane content.

### Architecture Decision

**Approach**: Extend `BrowserManager` (main process) with DOM interaction methods using `webContents.executeJavaScript()` and `webContents.sendInputEvent()`. Expose via tRPC. For external agents (desktop-mcp), extend `ConnectionManager` to target browser pane CDP pages.

The existing JS scripts (`FIND_ELEMENT_SCRIPT` from `click.ts`, `DOM_INSPECTOR_SCRIPT` from `dom-inspector.ts`) can be reused -- they're plain JS that works in any browser context.

### Step 2.1: Extract shared browser scripts

**New file**: `apps/desktop/src/shared/browser-scripts.ts`

Move `FIND_ELEMENT_SCRIPT` and `DOM_INSPECTOR_SCRIPT` into a shared module importable by both `BrowserManager` and `desktop-mcp`:

```typescript
export const FIND_ELEMENT_SCRIPT = `(opts) => { ... }`;  // from click.ts
export const DOM_INSPECTOR_SCRIPT = `function inspectDom(...) { ... }`;  // from dom-inspector.ts
```

### Step 2.2: Add DOM interaction methods to BrowserManager

**File**: `apps/desktop/src/main/lib/browser/browser-manager.ts`

Add methods:

| Method | Implementation |
|--------|---------------|
| `click(paneId, opts)` | Inject `FIND_ELEMENT_SCRIPT` → get coordinates → `wc.sendInputEvent({ type: 'mouseDown' })` + `mouseUp` |
| `type(paneId, opts)` | Optional focus via selector → `wc.insertText(text)` (or `sendInputEvent` for special keys) |
| `hover(paneId, opts)` | Inject find script → `wc.sendInputEvent({ type: 'mouseMove', x, y })` |
| `scroll(paneId, opts)` | `wc.sendInputEvent({ type: 'mouseWheel', deltaX, deltaY })` |
| `waitForElement(paneId, opts)` | Poll `wc.executeJavaScript('!!document.querySelector(selector)')` with timeout |
| `inspectDom(paneId, opts)` | Inject `DOM_INSPECTOR_SCRIPT` via `wc.executeJavaScript()` |
| `listPanes()` | Iterate `paneWebContentsIds`, return `{ paneId, url, title }` per entry |

### Step 2.3: Add tRPC procedures

**File**: `apps/desktop/src/lib/trpc/routers/browser/browser.ts`

Add 7 new procedures matching the BrowserManager methods above. All use Zod input validation and call through to `browserManager.*()`.

### Step 2.4: Inject paneId marker into webviews

**File**: `apps/desktop/src/main/lib/browser/browser-manager.ts` (in `register` method)

After registering a pane, inject a global marker:

```typescript
wc.executeJavaScript(`window.__SUPERSET_PANE_ID__ = ${JSON.stringify(paneId)}`);
```

Re-inject on navigation via `wc.on('did-navigate', () => { ... })` since page loads clear globals.

### Step 2.5: Extend ConnectionManager for browser pane targeting

**File**: `packages/desktop-mcp/src/mcp/connection/connection-manager.ts`

Add methods:

```typescript
async getBrowserPanePage(paneId: string): Promise<Page>
// Iterates CDP pages, evaluates window.__SUPERSET_PANE_ID__ to find match

async listBrowserPanes(): Promise<Array<{paneId: string; url: string; title: string}>>
// Returns all pages with a __SUPERSET_PANE_ID__ marker
```

### Step 2.6: Add browser-pane MCP tools

**New files** in `packages/desktop-mcp/src/mcp/tools/`:

| Tool | File | Description |
|------|------|-------------|
| `list_browser_panes` | `list-browser-panes/` | List all open browser panes with URLs |
| `browser_click` | `browser-click/` | Click element in a browser pane |
| `browser_type` | `browser-type/` | Type text in a browser pane |
| `browser_hover` | `browser-hover/` | Hover over element |
| `browser_scroll` | `browser-scroll/` | Scroll viewport or element |
| `browser_wait` | `browser-wait/` | Wait for element to appear |
| `browser_inspect_dom` | `browser-inspect-dom/` | Inspect DOM of browser pane |
| `browser_screenshot` | `browser-screenshot/` | Screenshot a specific browser pane |

Each tool takes a `paneId` parameter and uses `getBrowserPanePage(paneId)`.

Update `ToolContext` interface and `registerTools` in `packages/desktop-mcp/src/mcp/tools/index.ts`.

### Files Modified (Phase 2)

| File | Change |
|------|--------|
| `apps/desktop/src/shared/browser-scripts.ts` | **New** -- shared JS injection scripts |
| `apps/desktop/src/main/lib/browser/browser-manager.ts` | Add 7 DOM interaction methods, paneId injection |
| `apps/desktop/src/lib/trpc/routers/browser/browser.ts` | Add 7 tRPC procedures |
| `packages/desktop-mcp/src/mcp/connection/connection-manager.ts` | Add `getBrowserPanePage`, `listBrowserPanes` |
| `packages/desktop-mcp/src/mcp/tools/index.ts` | Update `ToolContext`, register new tools |
| `packages/desktop-mcp/src/mcp/tools/browser-click/browser-click.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-type/browser-type.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-hover/browser-hover.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-scroll/browser-scroll.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-wait/browser-wait.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-inspect-dom/browser-inspect-dom.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/browser-screenshot/browser-screenshot.ts` | **New** |
| `packages/desktop-mcp/src/mcp/tools/list-browser-panes/list-browser-panes.ts` | **New** |

---

## Phase 3: Element Selection for LLMs

**Goal**: Annotated screenshots (Set-of-Mark) and user-facing element inspector.

### Step 3.1: Annotated screenshot script

**New file**: `apps/desktop/src/shared/browser-scripts/annotate-elements.ts`

JS injected into the webview that:
1. Finds all interactive elements (reusing DOM_INSPECTOR_SCRIPT logic)
2. Creates a `<div id="__superset-som-overlay">` with `position: fixed; z-index: 999999; pointer-events: none`
3. For each element, draws a numbered badge + colored border overlay
4. Returns the element list with assigned numbers

Cleanup script removes `#__superset-som-overlay`.

### Step 3.2: Add `annotatedScreenshot` to BrowserManager and tRPC

**Files**: `browser-manager.ts`, `browser.ts` (tRPC router)

```typescript
async annotatedScreenshot(paneId: string): Promise<{base64: string; elements: AnnotatedElement[]}> {
  const wc = this.getWebContents(paneId);
  const elements = await wc.executeJavaScript(ANNOTATE_ELEMENTS_SCRIPT);
  const image = await wc.capturePage();
  await wc.executeJavaScript(REMOVE_ANNOTATIONS_SCRIPT);
  return { base64: image.toPNG().toString("base64"), elements };
}
```

### Step 3.3: Add `browser_annotated_screenshot` MCP tool

**New file**: `packages/desktop-mcp/src/mcp/tools/browser-annotated-screenshot/`

Returns the annotated image as MCP `image` content + text manifest mapping numbers to selectors.

### Step 3.4: User-facing element inspector

**New files**:
- `apps/desktop/src/shared/browser-scripts/element-inspector.ts` -- injected JS for hover highlight + click capture
- `.../BrowserPane/components/ElementInspectorPanel/ElementInspectorPanel.tsx` -- UI panel showing selected element info

**Modified files**:
- `browser-manager.ts` -- add `startInspector(paneId)`, `stopInspector(paneId)` methods
- `browser.ts` (tRPC) -- add `startInspector`, `stopInspector`, `onInspectorSelection` (subscription) procedures
- `BrowserToolbar.tsx` -- add inspector toggle button (crosshairs icon)

The inspector injects JS into the webview that highlights elements on hover and captures click targets. Selection events flow back via `webContents` IPC → BrowserManager EventEmitter → tRPC subscription → UI panel.

### Files Modified (Phase 3)

| File | Change |
|------|--------|
| `apps/desktop/src/shared/browser-scripts/annotate-elements.ts` | **New** -- SoM overlay script |
| `apps/desktop/src/shared/browser-scripts/element-inspector.ts` | **New** -- inspector overlay script |
| `apps/desktop/src/main/lib/browser/browser-manager.ts` | Add `annotatedScreenshot`, `startInspector`, `stopInspector` |
| `apps/desktop/src/lib/trpc/routers/browser/browser.ts` | Add 3 procedures |
| `.../BrowserPane/components/ElementInspectorPanel/ElementInspectorPanel.tsx` | **New** -- selection UI |
| `.../BrowserPane/components/BrowserToolbar/BrowserToolbar.tsx` | Add inspector toggle |
| `packages/desktop-mcp/src/mcp/tools/browser-annotated-screenshot/` | **New** -- MCP tool |

---

## Implementation Order

```
Phase 1 (Week 1) ─────────────────────────────
  1.1 TabsContent render-all-tabs
  1.2 Simplify usePersistentWebview
  1.3 Add telemetry
  
Phase 2 (Weeks 2-3) ──────────────────────────
  2.1 Extract shared browser scripts
  2.2 BrowserManager DOM methods
  2.3 tRPC procedures
  2.4 PaneId marker injection
  2.5 ConnectionManager browser pane support
  2.6 Browser-pane MCP tools

Phase 3 (Week 4) ─────────────────────────────
  3.1-3.3 Annotated screenshots
  3.4 Element inspector UI
```

Phases 1 and 2.1-2.3 can run in parallel since they touch different files.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Rendering all tabs increases memory | Max-mounted-tabs threshold (6), LRU eviction |
| react-mosaic may have issues with hidden instances | Disable resize on hidden tabs, block pointer events |
| `__SUPERSET_PANE_ID__` global cleared on navigation | Re-inject via `did-navigate` listener on webContents |
| `sendInputEvent` coordinates may differ from DOM getBoundingClientRect | Account for devicePixelRatio in coordinate translation |
| SoM overlays affect screenshot content | Use `pointer-events: none`, `position: fixed`, clean up immediately after capture |

---

## Verification

### Phase 1
- Open browser pane, fill in form data, switch tabs, switch back → no reload, form preserved
- Check console for `webContentsId` change warnings → should see none on tab switch
- Open 8+ tabs → verify LRU eviction kicks in at threshold

### Phase 2
- `list_browser_panes` returns open panes with URLs
- `browser_click` clicks a button in a web page loaded in a browser pane
- `browser_type` types into an input field
- `browser_inspect_dom` returns element tree with selectors and bounds
- `browser_wait` resolves when a dynamically loaded element appears
- All tools work from both chat (tRPC) and external agents (MCP)

### Phase 3
- `browser_annotated_screenshot` returns image with numbered elements + text manifest
- Toggle inspector in toolbar → hover highlights elements → click captures selector
- "Copy Selector" copies valid CSS selector to clipboard
