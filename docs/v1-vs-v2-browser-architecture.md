# V1 vs V2 Browser Architecture

## Overview

The Superset desktop app contains two distinct browser systems that serve different purposes. There is no feature flag or explicit naming in the codebase -- the distinction is architectural.

- **V1 (Browser Pane)**: The user-facing embedded web browser. Users see and interact with it directly. Built with Electron `<webview>` tags, rendered as a workspace pane.
- **V2 (Chat-Integrated Browser)**: The AI-accessible automation layer built on top of V1. Adds a main-process `BrowserManager`, tRPC IPC router, and MCP tool exposure so chat agents can control the browser programmatically.

V2 does not replace V1 -- it wraps and extends it.

---

## Architecture Diagram

```
V1 (Browser Pane - Renderer)                V2 (Chat Integration - Main Process + MCP)
================================            ==========================================

React Component Tree                        BrowserManager (EventEmitter)
  └─ BrowserPane.tsx                           ├─ register/unregister panes
       ├─ BrowserToolbar.tsx                   ├─ navigate(paneId, url)
       │    ├─ Back / Forward / Reload         ├─ screenshot(paneId) → base64 PNG
       │    ├─ Address bar (2-mode)            ├─ evaluateJS(paneId, code)
       │    └─ URL autocomplete                ├─ getConsoleLogs(paneId)
       ├─ BrowserErrorOverlay.tsx              ├─ openDevTools(paneId)
       └─ usePersistentWebview hook            ├─ console capture (500-entry buffer)
            ├─ <webview> lifecycle              └─ context menu builder
            ├─ DOM event listeners                     │
            ├─ Hidden container parking                │ tRPC IPC
            └─ Zustand state sync                      │
                                                       ▼
                                               tRPC Browser Router (15 procedures)
                                                  ├─ Mutations: navigate, goBack,
                                                  │  goForward, reload, screenshot,
                                                  │  evaluateJS, openDevTools,
                                                  │  clearBrowsingData, register,
                                                  │  unregister
                                                  ├─ Queries: getConsoleLogs, getPageInfo
                                                  └─ Subscriptions: consoleStream,
                                                     onNewWindow, onContextMenuAction
                                                       │
                                                       │ MCP exposure
                                                       ▼
                                               Chat LLM (Mastra harness)
                                                  "Navigate to github.com"
                                                  "Take a screenshot"
                                                  "Run document.title in the console"
```

---

## V1: Browser Pane (Renderer-Side)

The user-facing browser embedded as a workspace pane. All logic runs in the Electron renderer process.

### Key Files

| File | Purpose |
|------|---------|
| `apps/desktop/src/renderer/.../BrowserPane/BrowserPane.tsx` | Root component -- toolbar, error overlay, blank state |
| `apps/desktop/src/renderer/.../BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts` | Webview lifecycle, event handling, navigation methods |
| `apps/desktop/src/renderer/.../BrowserPane/components/BrowserToolbar/BrowserToolbar.tsx` | Address bar, nav buttons, loading indicator |
| `apps/desktop/src/renderer/.../BrowserPane/components/BrowserToolbar/hooks/useUrlAutocomplete/useUrlAutocomplete.ts` | History-powered URL suggestions |
| `apps/desktop/src/renderer/.../BrowserPane/components/BrowserErrorOverlay/BrowserErrorOverlay.tsx` | Error display with retry |
| `apps/desktop/src/renderer/.../BrowserPane/components/BrowserToolbar/components/BrowserOverflowMenu/BrowserOverflowMenu.tsx` | Additional browser actions |
| `apps/desktop/src/renderer/.../BrowserPane/components/BrowserToolbar/components/UrlSuggestions/UrlSuggestions.tsx` | Autocomplete dropdown UI |
| Renderer store (`useTabsStore`) | Per-pane browser state (URL, history, loading, error) |

### How It Works

**Webview Creation & Persistence** (`usePersistentWebview.ts`):

The hook manages `<webview>` elements with a module-level singleton registry:

```typescript
const webviewRegistry = new Map<string, Electron.WebviewTag>();
const registeredWebContentsIds = new Map<string, number>();
let hiddenContainer: HTMLDivElement | null = null;
```

On mount, the hook either reclaims an existing webview or creates a new one:

```typescript
let webview = webviewRegistry.get(paneId);
if (webview) {
    container.appendChild(webview);        // reclaim from hidden container
    syncStoreFromWebview(webview);
} else {
    webview = document.createElement("webview");
    webview.setAttribute("partition", "persist:superset");
    webviewRegistry.set(paneId, webview);
    container.appendChild(webview);
    webview.src = sanitizeUrl(initialUrl);
}
```

On unmount, the webview is parked offscreen (not destroyed):

```typescript
return () => {
    // remove event listeners...
    getHiddenContainer().appendChild(wv);  // park at left:-9999px
};
```

**Event Handling**:

The hook listens to 8 webview DOM events:

| Event | What V1 Does |
|-------|-------------|
| `dom-ready` | Registers webContentsId with main process via tRPC |
| `did-start-loading` | Sets `isLoading: true`, clears errors |
| `did-stop-loading` | Sets `isLoading: false`, updates URL/title in store, upserts browser history |
| `did-navigate` | Updates store with new URL |
| `did-navigate-in-page` | Updates store for hash/pushState navigations |
| `page-title-updated` | Updates title in store |
| `page-favicon-updated` | Updates favicon in store and history DB |
| `did-fail-load` | Shows error overlay (ignores `ERR_ABORTED`) |

**Navigation**:

V1 manages its own history stack in Zustand (not the webview's built-in history):

```typescript
const goBack = useCallback(() => {
    const url = navigateBrowserHistory(paneId, "back");
    if (url) {
        isHistoryNavigation.current = true;
        webviewRegistry.get(paneId)?.loadURL(sanitizeUrl(url));
    }
}, [paneId, navigateBrowserHistory]);
```

The `isHistoryNavigation` ref prevents back/forward from creating duplicate history entries.

**Drag Passthrough**:

A critical renderer-level concern: `<webview>` tags create separate Chromium compositor layers that swallow drag events, breaking mosaic pane rearrangement:

```typescript
function setWebviewsDragPassthrough(passthrough: boolean) {
    for (const webview of webviewRegistry.values()) {
        webview.style.pointerEvents = passthrough ? "none" : "";
    }
}
window.addEventListener("dragstart", () => setWebviewsDragPassthrough(true), true);
window.addEventListener("dragend", () => setWebviewsDragPassthrough(false), true);
```

**Toolbar** (`BrowserToolbar.tsx`):

Two display modes:
1. **Display mode**: Shows URL (truncated) + page title. Click to edit.
2. **Edit mode**: Text input with autocomplete dropdown. Submit navigates, Escape exits.

Autocomplete queries the SQLite browser history via tRPC, returning the 10 most relevant matches by URL and title.

**State Shape** (Zustand per pane):

```typescript
{
    currentUrl: string;
    history: Array<{ url: string; title: string; faviconUrl?: string }>;
    historyIndex: number;
    isLoading: boolean;
    error: { code: number; description: string; url: string } | null;
}
```

**Browser History Persistence** (Drizzle + SQLite):

```sql
url TEXT PRIMARY KEY,
title TEXT,
faviconUrl TEXT,
lastVisitedAt TIMESTAMP,
visitCount INTEGER  -- incremented on upsert conflict
```

### What V1 Can Do

- Display web pages in a workspace pane
- Navigate via address bar with URL sanitization and search fallback
- Back/Forward/Reload with proper history management
- Show page title and favicon
- Autocomplete URLs from browsing history
- Display error overlays for failed loads
- Handle `target="_blank"` links (opens in new browser pane)
- Handle context menu "Open in Split" (opens link in new pane)
- Persist webview state across tab switches (offscreen parking)
- Persist browsing history across app restarts (SQLite)

### What V1 Cannot Do

- Take screenshots
- Execute JavaScript on the page
- Read console output
- Be controlled by AI agents
- Programmatically interact with page elements (click, type)
- Stream real-time events to other systems
- Clear browsing data programmatically

---

## V2: Chat-Integrated Browser (Main Process + tRPC + MCP)

The automation layer that makes V1's browser panes controllable by AI agents. Adds a main-process singleton, IPC bridge, and MCP tool exposure.

### Key Files

| File | Purpose |
|------|---------|
| `apps/desktop/src/main/lib/browser/browser-manager.ts` | Main-process singleton managing webContents instances |
| `apps/desktop/src/lib/trpc/routers/browser/browser.ts` | tRPC router exposing 15 IPC procedures |
| `apps/desktop/src/lib/trpc/routers/browser-history/index.ts` | tRPC router for persistent history (4 procedures) |
| `packages/desktop-mcp/src/mcp/mcp-server.ts` | MCP server creation |
| `packages/desktop-mcp/src/mcp/tools/navigate/navigate.ts` | MCP navigate tool |
| `packages/desktop-mcp/src/mcp/tools/take-screenshot/take-screenshot.ts` | MCP screenshot tool |
| `packages/desktop-mcp/src/mcp/tools/click/click.ts` | MCP click tool |
| `packages/desktop-mcp/src/mcp/tools/type-text/type-text.ts` | MCP type tool |
| `packages/desktop-mcp/src/mcp/tools/send-keys/send-keys.ts` | MCP keyboard tool |
| `packages/desktop-mcp/src/mcp/tools/evaluate-js/evaluate-js.ts` | MCP JS evaluation tool |
| `packages/desktop-mcp/src/mcp/tools/inspect-dom/inspect-dom.ts` | MCP DOM inspection tool |
| `packages/desktop-mcp/src/mcp/tools/get-console-logs/get-console-logs.ts` | MCP console tool |
| `packages/desktop-mcp/src/mcp/tools/get-window-info/get-window-info.ts` | MCP window info tool |
| `packages/desktop-mcp/src/mcp/connection/connection-manager.ts` | Puppeteer CDP connection management |
| `packages/desktop-mcp/src/mcp/focus-lock/focus-lock.ts` | Focus suppression during automation |
| `packages/desktop-mcp/src/mcp/console-capture/console-capture.ts` | CDP-level console capture |

### Layer 1: BrowserManager (Main Process)

A singleton `EventEmitter` in the main process that wraps Electron's `webContents` API:

```typescript
class BrowserManager extends EventEmitter {
    private paneWebContentsIds = new Map<string, number>();
    private consoleLogs = new Map<string, ConsoleEntry[]>();
    private consoleListeners = new Map<string, () => void>();
    private contextMenuListeners = new Map<string, () => void>();
}
export const browserManager = new BrowserManager();
```

**Registration**: When V1's `usePersistentWebview` fires `dom-ready`, it calls `browser.register({ paneId, webContentsId })`. The BrowserManager stores the mapping and sets up:

1. **Background throttling** -- prevents offscreen persistent webviews from running at full speed
2. **Window open handler** -- blocks popups, emits `new-window:{paneId}` event
3. **Console capture** -- listens to `console-message` events, stores in a 500-entry circular buffer, emits `console:{paneId}` per entry
4. **Context menu** -- intercepts right-click, builds native `Menu` with custom actions

**Automation Methods**:

| Method | What It Does |
|--------|-------------|
| `navigate(paneId, url)` | `webContents.loadURL(sanitizeUrl(url))` |
| `screenshot(paneId)` | `webContents.capturePage()` → copies to clipboard + returns base64 PNG |
| `evaluateJS(paneId, code)` | `webContents.executeJavaScript(code)` |
| `getConsoleLogs(paneId)` | Returns stored `ConsoleEntry[]` from circular buffer |
| `openDevTools(paneId)` | `webContents.openDevTools({ mode: "detach" })` |
| `getWebContents(paneId)` | Returns the raw `Electron.WebContents` or null |

**Cleanup**: On unregister, all listeners and console logs for a pane are cleaned up. Try/catch guards handle cases where webContents has been destroyed.

### Layer 2: tRPC Browser Router (IPC Bridge)

Exposes BrowserManager to the renderer via tRPC over Electron IPC:

**15 Procedures**:

| Type | Procedure | What It Does |
|------|-----------|-------------|
| Mutation | `register` | Map paneId → webContentsId |
| Mutation | `unregister` | Clean up pane |
| Mutation | `navigate` | Load URL in pane |
| Mutation | `goBack` | `webContents.goBack()` |
| Mutation | `goForward` | `webContents.goForward()` |
| Mutation | `reload` | `webContents.reload()` or `reloadIgnoringCache()` |
| Mutation | `screenshot` | Capture page as base64 PNG |
| Mutation | `evaluateJS` | Execute JS, return result |
| Mutation | `openDevTools` | Open detached DevTools |
| Mutation | `clearBrowsingData` | Clear cookies/cache/storage/all on `persist:superset` session |
| Query | `getConsoleLogs` | Get buffered console entries |
| Query | `getPageInfo` | URL, title, canGoBack, canGoForward, isLoading |
| Subscription | `consoleStream` | Stream new console entries in real-time |
| Subscription | `onNewWindow` | Stream `target="_blank"` / `window.open` events |
| Subscription | `onContextMenuAction` | Stream context menu actions (e.g., "open-in-split") |

**Subscription pattern** (required for trpc-electron -- async generators silently fail):

```typescript
consoleStream: publicProcedure
    .input(z.object({ paneId: z.string() }))
    .subscription(({ input }) => {
        return observable<ConsoleEntry>((emit) => {
            const handler = (entry: ConsoleEntry) => emit.next(entry);
            browserManager.on(`console:${input.paneId}`, handler);
            return () => browserManager.off(`console:${input.paneId}`, handler);
        });
    }),
```

### Layer 3: MCP Tools (AI Agent Interface)

The `packages/desktop-mcp` package creates an MCP server that exposes browser automation as tools for AI agents:

```typescript
// mcp-server.ts
export function createMcpServer(): McpServer {
    const server = new McpServer({ name: "desktop-automation", version: "0.1.0" });
    const connection = new ConnectionManager();
    registerTools({
        server,
        getPage: () => connection.getPage(),
        consoleCapture: connection.consoleCapture,
    });
    return server;
}
```

**ConnectionManager** connects to the Electron app via CDP (Chrome DevTools Protocol) using puppeteer-core:

```typescript
export class ConnectionManager {
    async getPage(): Promise<Page> {
        if (this.page && this.browser?.connected) {
            await this.focusLock.inject(this.page);
            return this.page;
        }
        return this.connect();  // lazy connect via puppeteer.connect()
    }

    private async connect(): Promise<Page> {
        this.browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${process.env.DESKTOP_AUTOMATION_PORT}`,
        });
        // Find main renderer (not browser pane webviews)
        const appPage = pages.find(p =>
            p.url().startsWith("http://localhost:") || p.url().startsWith("file://")
        );
        this.consoleCapture.attach(appPage);
        this.focusLock.attach(appPage);
        return appPage;
    }
}
```

**9 MCP Tools**:

| Tool | Description | Key Detail |
|------|------------|-----------|
| `navigate` | Load URL or app route | Supports `url` (full URL) or `path` (hash route for in-app navigation) |
| `take_screenshot` | Capture page as PNG | Returns base64 image, supports optional `rect` for region capture |
| `click` | Click element at coordinates | Uses Puppeteer's `page.mouse.click()` |
| `type_text` | Type text into focused element | Uses Puppeteer's `page.keyboard.type()` |
| `send_keys` | Send keyboard events | For shortcuts, special keys |
| `evaluate_js` | Execute JavaScript | Returns serialized result |
| `inspect_dom` | Analyze page DOM structure | Returns DOM tree or element info |
| `get_console_logs` | Read console output | From ConsoleCapture buffer |
| `get_window_info` | Get page metadata | URL, title, viewport size |

**FocusLock** (`focus-lock.ts`):

A critical piece for automation stability. When Electron loses OS focus (e.g., Claude Code's terminal takes over between MCP tool calls), Radix UI components detect blur events and close dropdowns/popovers. FocusLock suppresses these:

```javascript
// Injected into the renderer
const suppress = (e) => {
    if (e.relatedTarget === null && !document.hasFocus()) {
        e.stopImmediatePropagation();  // block blur before React/Radix sees it
    }
};
document.addEventListener('blur', suppress, true);
document.addEventListener('focusout', suppress, true);
```

Auto-deactivates after 5 seconds of inactivity so normal manual usage is unaffected. Re-injects on page navigation.

---

## Side-by-Side Comparison

| Aspect | V1 (Browser Pane) | V2 (Chat-Integrated) |
|--------|-------------------|---------------------|
| **Process** | Renderer | Main process + MCP server |
| **Who uses it** | Human users directly | AI agents via chat |
| **Navigation** | Address bar + toolbar buttons | Programmatic `navigate(paneId, url)` |
| **Screenshots** | None | `webContents.capturePage()` → base64 PNG |
| **JS execution** | None | `webContents.executeJavaScript(code)` |
| **Console access** | None | 500-entry circular buffer + real-time streaming |
| **Click/Type** | User does it manually | Puppeteer `page.mouse.click()` / `page.keyboard.type()` |
| **DOM inspection** | None (user can open DevTools manually) | `inspect_dom` MCP tool |
| **History** | Zustand (in-memory) + SQLite (persistent) | Relies on V1's history |
| **URL autocomplete** | Yes (from SQLite history) | N/A (agents type URLs directly) |
| **Error handling** | Error overlay with retry | Error returned in MCP tool response |
| **Multi-pane** | Yes (mosaic layout, webview registry) | Operates on specific paneId |
| **Persistence** | Hidden container parking | Stateless (reconnects on demand) |
| **Context menu** | Native Electron menu with 10+ actions | N/A |
| **Drag handling** | Pointer-events passthrough during drags | N/A |
| **Focus management** | Standard browser focus | FocusLock suppresses blur during automation |
| **Availability** | Always | Dev mode only (`DESKTOP_AUTOMATION_PORT`) |

---

## Data Flow: How V1 and V2 Connect

### User Navigates Manually (V1 only)

```
User types URL in address bar
  → BrowserToolbar.onNavigate(url)
  → usePersistentWebview.navigateTo(url)
  → webview.loadURL(sanitizeUrl(url))
  → webview fires "did-navigate" event
  → usePersistentWebview updates Zustand store
  → usePersistentWebview upserts SQLite history
  → BrowserToolbar re-renders with new URL
```

### AI Agent Navigates (V2 → V1)

```
User says "go to github.com" in chat
  → Chat LLM (Mastra harness) decides to call MCP tool
  → MCP "navigate" tool called with { url: "https://github.com" }
  → ConnectionManager.getPage() → Puppeteer CDP connection
  → page.goto("https://github.com")
  → [OR: tRPC browser.navigate({ paneId, url })]
  → BrowserManager.navigate(paneId, url)
  → webContents.loadURL(sanitizeUrl(url))
  → V1's webview fires navigation events
  → V1's usePersistentWebview syncs store from webview
  → V1's toolbar updates to show new URL
```

### AI Agent Takes Screenshot (V2 only)

```
Chat LLM decides to call "take_screenshot"
  → MCP tool invoked
  → ConnectionManager.getPage()
  → page.screenshot({ encoding: "base64", type: "png" })
  → base64 PNG returned to LLM
  → LLM analyzes the image and responds to user
```

### Console Streaming (V2, built on V1's webview)

```
Web page logs to console
  → V1's <webview> fires "console-message" event
  → V2's BrowserManager.setupConsoleCapture() handler fires
  → Entry added to circular buffer (max 500)
  → BrowserManager emits "console:{paneId}" event
  → tRPC consoleStream subscription picks up event
  → observable.emit.next(entry) sends to subscriber
  → Chat system receives real-time console log
```

### Context Menu "Open in Split" (V1 ← V2)

```
User right-clicks a link in browser pane
  → V2's BrowserManager.setupContextMenu() intercepts "context-menu" event
  → Builds native Electron Menu with "Open Link as New Split"
  → User clicks "Open Link as New Split"
  → BrowserManager emits "context-menu-action:{paneId}" with { action: "open-in-split", url }
  → tRPC onContextMenuAction subscription fires
  → V1's usePersistentWebview receives event
  → Calls tabsStore.openInBrowserPane(workspaceId, url)
  → New V1 browser pane created with the link URL
```

---

## What V2 Adds to V1

V2 is not a replacement. It is an **extension layer** that makes V1 machine-readable and machine-controllable:

1. **Observability**: Console capture, page info queries, and screenshot APIs let AI agents "see" what's in the browser.

2. **Control**: Navigate, evaluate JS, click, type, and send keys let AI agents "act" in the browser.

3. **Real-time streaming**: tRPC subscriptions (observables) let the chat system react to browser events as they happen.

4. **Cross-process bridge**: V1 lives in the renderer; V2's BrowserManager lives in the main process, making browser capabilities accessible to both the renderer (via tRPC) and external agents (via MCP/CDP).

5. **Automation stability**: FocusLock prevents UI components from dismissing during agent tool calls when the Electron window loses OS focus.

6. **Context menus**: V2's main-process context menu builder provides actions that flow back to V1 (like "Open in Split") -- something the renderer alone couldn't do because context menu access requires main-process Electron APIs.

### What V1 Provides That V2 Relies On

- The `<webview>` element and its `webContentsId` (V2 registers it)
- DOM events that trigger store updates (V2's console capture piggybacks on the same webContents)
- The persistent webview lifecycle (V2 doesn't manage creation/destruction)
- Zustand state that drives the UI (V2 doesn't update the store directly)
- SQLite browser history (V2 doesn't write history)
- URL sanitization logic (duplicated in both layers)
