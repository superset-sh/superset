# V2 Browser Gap Analysis & Improvement Plan

## Referenced Issues

| Issue | Title | Status | Category |
|-------|-------|--------|----------|
| #3076 | Browser refreshes every 5-20 seconds | Open | Reload bug |
| #3040 | Browser reloads when navigating between tabs | Open | Reload bug |
| #1834 | Browser Preview does not keep alive when switching tabs | Open | Reload bug |
| #1935 | Browser refreshes upon switching tabs | Closed (regressed) | Reload bug |
| #1637 | Browser pane reloads page every time you switch away and back | Closed (regressed) | Reload bug |
| #1801 | MCP server for built-in browser automation | Open | Feature request |
| #2551 | Internal browser element selection for easier LLM targeting | Open | Feature request |

---

## 1. Browser Tab Reload Bug (Critical)

**Impact**: Makes the browser nearly unusable. 5 issues filed, 2 closed but regressed.

### Root Cause Analysis

The persistence mechanism in `usePersistentWebview.ts` parks webviews in a hidden offscreen container when their pane unmounts:

```typescript
// On unmount
return () => {
    // remove event listeners...
    getHiddenContainer().appendChild(wv);  // park offscreen
};
```

Several code-level issues likely cause unwanted reloads:

#### 1.1 Hidden Container Dimensions

The hidden container uses full viewport dimensions while positioned offscreen:

```typescript
// usePersistentWebview.ts:14-27
hiddenContainer.style.position = "fixed";
hiddenContainer.style.left = "-9999px";
hiddenContainer.style.top = "-9999px";
hiddenContainer.style.width = "100vw";   // Problem
hiddenContainer.style.height = "100vh";  // Problem
```

A `100vw x 100vh` div positioned at `-9999px` can trigger Chromium compositor recalculations when webviews are reparented into it. The compositor may detect the dimensional change and invalidate the webview's backing store.

**Fix**: Use `1px x 1px` with `overflow: hidden`, or `visibility: hidden` on individual webviews instead of offscreen positioning.

#### 1.2 webContentsId Changes on DOM Reparenting

The code explicitly anticipates `webContentsId` changing after reparenting:

```typescript
// usePersistentWebview.ts:207-214
const handleDomReady = () => {
    const webContentsId = wv.getWebContentsId();
    const previousId = registeredWebContentsIds.get(paneId);
    if (previousId !== webContentsId) {
        registeredWebContentsIds.set(paneId, webContentsId);
        registerBrowser({ paneId, webContentsId });  // re-registers with main process
    }
};
```

When Electron moves a `<webview>` between DOM containers, the compositor may create a new backing store, assigning a new `webContentsId`. This triggers:
1. Re-registration with `BrowserManager` in main process
2. Previous console/context-menu listeners cleaned up and re-attached
3. Potential content loss during the transition

**Fix**: Investigate whether keeping the webview in the same DOM parent (using `visibility: hidden` / `display: none` instead of reparenting) avoids `webContentsId` changes entirely. If reparenting is required, add a guard that skips `loadURL` if the page is already loaded.

#### 1.3 React Unmount/Remount Cycle

When the user switches tabs, React unmounts `BrowserPane`, triggering the `useEffect` cleanup that parks the webview. When switching back, `BrowserPane` remounts, and the effect re-runs, reclaiming the webview. This cycle is correct in theory, but:

- If the React tree remounts more aggressively than expected (e.g., key changes, parent re-renders), the webview ping-pongs between containers
- Each reparent fires `dom-ready`, potentially triggering re-registration
- The 5-20 second interval in #3076 suggests a parent component may be re-rendering periodically (e.g., a timer, subscription, or store update causing the mosaic layout to remount)

**Fix**: Investigate what causes `BrowserPane` to unmount. Add logging to track mount/unmount frequency. If a parent re-render is the cause, memoize the component or lift the webview management above the component that remounts.

#### 1.4 No Synchronization Between Store and Webview After Park

When a webview is parked hidden, it can still receive navigation events (e.g., an agent navigates while the pane is hidden). On reclaim, `syncStoreFromWebview` tries to reconcile:

```typescript
// usePersistentWebview.ts:150-171
const syncStoreFromWebview = useCallback((webview) => {
    const url = webview.getURL();
    const title = webview.getTitle();
    if (url !== currentUrl) {
        store.updateBrowserUrl(paneId, url, title, faviconUrlRef.current);
    }
}, [paneId]);
```

But if the sync detects a URL mismatch and updates the store, downstream effects could trigger a re-navigation, causing an unnecessary reload.

**Fix**: Ensure store updates from sync don't trigger navigation side effects.

#### 1.5 Hidden Container Accumulation

Parked webviews are never cleaned up unless explicitly destroyed. Over a long session, the hidden container accumulates webviews, increasing memory pressure and potentially triggering garbage collection cycles that affect active webviews.

**Fix**: Add a cleanup strategy (e.g., destroy webviews for tabs that have been hidden for >N minutes, or limit the total number of parked webviews).

### Recommended Investigation Steps

1. Add telemetry logging to `handleDomReady` to track `webContentsId` changes on tab switch
2. Log `useEffect` mount/unmount in `usePersistentWebview` to measure reparenting frequency
3. Test with `visibility: hidden` on individual webviews instead of offscreen container reparenting
4. Profile whether any periodic store update or subscription causes `BrowserPane` to unmount

---

## 2. MCP Tools Cannot Control Browser Panes (Critical Gap)

**Issue**: #1801 requests MCP browser automation. MCP tools partially exist (`packages/desktop-mcp`) but they **do not control browser pane content**.

### The Problem

The `ConnectionManager` in `desktop-mcp` connects via CDP to the **main Electron renderer** and explicitly filters out browser pane webviews:

```typescript
// connection-manager.ts:47-50
const appPage = pages.find((p) => {
    const url = p.url();
    return url.startsWith("http://localhost:") || url.startsWith("file://");
});
```

This means all 9 MCP tools (`navigate`, `take_screenshot`, `click`, `type_text`, `send_keys`, `evaluate_js`, `inspect_dom`, `get_console_logs`, `get_window_info`) operate on the **Superset app UI**, not on web pages loaded in browser panes.

Meanwhile, the tRPC browser router (`apps/desktop/src/lib/trpc/routers/browser/browser.ts`) does control browser pane content, but only exposes basic operations (`navigate`, `screenshot`, `evaluateJS`, `goBack`, `goForward`, `reload`). It has no click, type, hover, scroll, wait, or DOM inspection capabilities.

### Architecture Gap

```
Current state:

MCP Tools ──→ CDP ──→ Main Renderer (Superset App UI) ✅
                      Browser Pane Webviews             ❌ (filtered out)

tRPC Router ──→ IPC ──→ BrowserManager ──→ webContents  ✅ (basic ops only)
                                                          ❌ (no click/type/hover/DOM)
```

### What's Needed

Option A: **Extend tRPC browser router** with rich automation methods and expose them as MCP tools:

```
Chat LLM ──→ MCP Tools ──→ tRPC Browser Router ──→ BrowserManager ──→ webContents
                            (extended with click, type, hover, scroll, DOM inspection, etc.)
```

Option B: **Connect MCP directly to browser pane webContents via CDP**:

```
Chat LLM ──→ MCP Tools ──→ CDP connection to webview webContents
                            (requires webview remote debugging)
```

Option A is simpler since `BrowserManager` already has the `webContents` reference and `executeJavaScript` capability. Click, type, hover, scroll, and DOM inspection can all be implemented via injected JS.

### Missing Automation Capabilities

| Capability | tRPC Router | MCP (App UI) | Needed for Browser Pane |
|-----------|-------------|-------------|------------------------|
| Navigate | Yes | Yes | Already works |
| Screenshot | Yes | Yes | Already works |
| Evaluate JS | Yes | Yes | Already works |
| Console logs | Yes (stream) | Yes (buffer) | Already works |
| Page info | Yes | Yes | Already works |
| Click element | No | Yes | **Missing** |
| Type text | No | Yes | **Missing** |
| Hover | No | No | **Missing** |
| Scroll | No | No | **Missing** |
| Wait for element | No | No | **Missing** |
| DOM inspection | No | Yes | **Missing** |
| Form filling | No | No | **Missing** |
| File upload | No | No | **Missing** |
| Drag and drop | No | No | **Missing** |
| Key sequences | No | Partial | **Missing** |
| Element highlighting | No | No | **Missing** |

---

## 3. Element Selection for LLMs (Feature Gap)

**Issue**: #2551 requests an element selector in the browser pane so users can inspect/select elements and provide details to LLMs. Cursor has this feature.

### Current State

- `inspect_dom` in `desktop-mcp` returns structured element data (selectors, text, bounds, ARIA roles) but only for the **app UI**, not browser panes
- `take_screenshot` returns raw PNG with no element annotations
- No mechanism for users to visually select an element and get its selector/attributes
- No mechanism for LLMs to "see" element boundaries on screenshots

### What's Needed

#### 3.1 User-Facing Element Inspector

An interactive overlay in the browser pane that:
- Highlights elements on hover (like browser DevTools inspect mode)
- On click, captures element details (CSS selector, text content, bounding box, attributes, computed styles)
- Copies details to clipboard or inserts into chat
- Shows a floating panel with element info

Implementation: Inject JS into the webview via `webContents.executeJavaScript()` that adds a mouse-tracking overlay. On click, serialize element data and send back via `webContents.send()` / IPC.

#### 3.2 LLM-Facing Annotated Screenshots

Screenshots with element bounding boxes overlaid:
- Number each interactive element
- Draw colored rectangles around clickable/typeable elements
- Return both the annotated image and a text manifest mapping numbers to selectors

This is the approach used by tools like [SoM (Set-of-Mark)](https://github.com/anthropics/anthropic-cookbook) and is critical for vision-based LLM interaction.

#### 3.3 Accessibility Tree Export

Export the browser pane's accessibility tree as structured data:
- ARIA roles, labels, names
- Interactive element states (disabled, checked, expanded)
- Landmark regions (nav, main, aside)
- Tab order

This gives LLMs a semantic understanding of the page without needing screenshots.

---

## 4. Additional Improvements

### 4.1 Address Bar Sync During Agent Navigation

When an AI agent navigates via tRPC/MCP, the V1 toolbar doesn't always update immediately. The `syncStoreFromWebview` function runs on reclaim, but navigation events during park may be missed.

**Fix**: The `did-navigate` listener is removed on unmount. Consider keeping a minimal listener attached even while parked, or sync on every reclaim.

### 4.2 Console Log Improvements

Current: 500-entry circular buffer, no filtering.

Needed:
- Filter by level (error-only mode for debugging)
- Filter by source URL (ignore third-party script noise)
- Stack traces for errors
- Network request logging (XHR/fetch URLs, status codes)
- Performance entries (LCP, FCP, CLS)

### 4.3 Multi-Page Browser Automation

Current MCP tools have no concept of "which browser pane." The tRPC router uses `paneId`, but MCP tools don't accept a pane identifier.

**Fix**: MCP browser tools should accept an optional `paneId` parameter. Default to the focused browser pane. Add a `list_browser_panes` tool that returns all active panes with their URLs.

### 4.4 Navigation Completion Detection

No current mechanism to wait for a page to finish loading after `navigate`. Agents must guess or poll.

**Fix**: Add a `waitForNavigation` option to the navigate tool that resolves after `did-stop-loading` fires, with a configurable timeout.

### 4.5 Cookie/Auth Session Management

The `persist:superset` partition shares cookies across all browser panes, but there's no way for agents to:
- Set cookies programmatically (for authenticated testing)
- Switch between session profiles
- Clear cookies for a specific domain

**Fix**: Extend `clearBrowsingData` to support domain-scoped clearing. Add `setCookie` / `getCookies` procedures.

### 4.6 Responsive Testing

No way to set viewport size for a browser pane. The webview fills its pane, but agents testing responsive layouts need explicit viewport control.

**Fix**: Add a `setViewport(paneId, width, height)` procedure that resizes the webview or uses `webContents.enableDeviceEmulation()`.

---

## Priority Matrix

### P0 -- Blocking / Regression

| Item | Issues | Effort | Impact |
|------|--------|--------|--------|
| Fix browser tab reload on switch | #3076, #3040, #1834 | Medium | Critical -- app is unusable for browser users |
| Fix periodic auto-reload (5-20s) | #3076 | Medium | Critical -- suggests a re-render loop |

### P1 -- Core Feature Gaps

| Item | Issues | Effort | Impact |
|------|--------|--------|--------|
| MCP tools for browser pane content | #1801 | Large | Unlocks AI browser automation |
| Element click/type/hover via MCP | #1801 | Medium | Core automation actions |
| DOM inspection for browser panes | #1801, #2551 | Medium | LLM page understanding |
| Wait-for-element / wait-for-navigation | #1801 | Small | Reliable automation |

### P2 -- Enhancement

| Item | Issues | Effort | Impact |
|------|--------|--------|--------|
| User-facing element inspector | #2551 | Medium | Cursor-parity feature |
| Annotated screenshots (Set-of-Mark) | #2551 | Medium | Vision LLM effectiveness |
| Accessibility tree export | #2551 | Small | Semantic page understanding |
| Multi-pane MCP targeting | -- | Small | Multi-browser workflows |
| Scroll control | -- | Small | Page automation completeness |
| Navigation completion detection | -- | Small | Automation reliability |

### P3 -- Nice to Have

| Item | Issues | Effort | Impact |
|------|--------|--------|--------|
| Console log filtering by level/source | -- | Small | Debugging convenience |
| Network request logging | -- | Medium | API debugging |
| Cookie/session management | -- | Small | Auth testing |
| Viewport/responsive emulation | -- | Small | Responsive testing |
| File upload handling | -- | Medium | Form automation |
| Drag-and-drop support | -- | Large | Niche use cases |

---

## Summary

The three most impactful improvements are:

1. **Fix the reload bug** (P0): The hidden container reparenting approach has several potential failure modes. Investigate `webContentsId` changes, container dimensions, and React remount frequency. This affects every browser user.

2. **Bridge MCP tools to browser panes** (P1): The MCP tools exist but target the wrong thing (app UI vs browser content). Extending the tRPC browser router with click/type/hover/DOM inspection and exposing those as MCP tools would close the #1801 gap.

3. **Element selection + annotated screenshots** (P2): Adding a user-facing element inspector and Set-of-Mark style annotated screenshots would close #2551 and significantly improve LLM effectiveness when working with web pages.
