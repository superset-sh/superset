# CLI + agent control of the in-app browser pane (CDP exposure)

Status: phases 1–2 IMPLEMENTED + verified E2E over CDP (2026-08-15). Branch:
`cli-cdp-browser-control`. Remaining: MCP tools (phase 3), the "Agent controlling"
badge + consent setting, and the LRU eviction exemption for actively-driven panes.

## Problem

Agents (and the `superset` CLI) cannot drive the browser pane inside Superset. The pane's guest
`webContents` lives in the desktop main process, and its control surface — `browser.*` tRPC
(`apps/desktop/src/lib/trpc/routers/browser/browser.ts`) wrapping `BrowserManager`
(`apps/desktop/src/main/lib/browser/browser-manager.ts`) — is reachable only over electron-trpc
IPC from the renderer. There is no raw CDP exposure at all (`webContents.debugger` is unused;
the only CDP in the product is the dev-only, app-wide `RENDERER_REMOTE_DEBUG_PORT` switch).

Goal: an agent in a workspace terminal (or any CLI caller, local or remote) can list, open,
navigate, screenshot, eval, read console from, and — for browser-use / Playwright-class tooling —
speak **raw CDP** to the browser panes of its workspace, while the user watches it happen live in
the pane.

## What exists today (verified)

| Piece | Location | State |
|---|---|---|
| Pane = Electron `<webview>` guest, partition `persist:superset` | `browserRuntimeRegistry.ts` (v2 renderer) | guests parked in `#browser-runtime-root`, 3-entry hidden LRU |
| `paneId → webContentsId` map + navigate/screenshot/evaluateJS/console(500-entry ring)/openDevTools | `main/lib/browser/browser-manager.ts` | works; `evaluateJS`/`getConsoleLogs`/`consoleStream` currently have **zero callers** |
| Renderer registers guest on `dom-ready` via `browser.register` | `browserRuntimeRegistry.handleDomReady` | register carries only `paneId` — no workspaceId |
| CLI → host-service transport | `packages/cli/src/lib/host-target/resolveHostTarget.ts` | local: manifest PSK (`~/.superset/host/<org>/manifest.json`); remote: relay `/hosts/<org>:<machine>/trpc` + user JWT |
| host-service → desktop main channel | — | **does not exist** (only desktop→host-service) |
| Desktop-main localhost server | notifications Express server, `127.0.0.1:51741` | unauthenticated; already called by CLI (`/settings-changed`) — not suitable as-is for control |
| Pane layout (creating panes) | renderer localStorage `v2WorkspaceLocalState` | unreachable externally by design; existing consume-hook: `?openUrl&openUrlTarget&openUrlRequestId` + `useConsumeOpenUrlRequest` |
| MCP server (30 tools incl. `terminals_read`) | `packages/mcp`, served from `apps/api /mcp` | reaches hosts via relay — same rail as CLI remote |
| Raw CDP precedent | terminals: WS `/terminal/:id` on host-service, tunneled over relay | proves authed WS over the same rail works remotely |

## Non-goals

- Exposing the IDE shell/renderer over CDP. **Scope is guest webContents only.** App-wide
  `--remote-debugging-port` in production is explicitly rejected: it exposes every renderer
  (auth tokens, tRPC internals) unauthenticated.
- Headless browser on desktop-less hosts (`superset start` standalone). No desktop → no pane;
  the router returns a clear "this host has no browser (no desktop app attached)" error. A
  headless-chromium fallback can be a later, separate project.

## Design

One new hop plus reuse of the existing rail:

```
agent / CLI / MCP
   │  (existing) host tRPC — local manifest PSK, or relay + user JWT
   ▼
host-service: new `browser` router + WS route /browser/:paneId/cdp
   │  (new) loopback HTTP+WS "browser bridge", endpoint+secret passed
   │        by desktop main via child env at spawn
   ▼
desktop main: BrowserBridge server → BrowserManager → guest webContents
   │                                    └─ webContents.debugger (raw CDP)
   ▼
renderer: pane open/focus via existing consume-request pattern
```

Why this shape:
- **CLI, MCP, and remote agents all work for free.** They already speak host tRPC; browser
  becomes just another router. Remote CDP tunnels like terminals do.
- **Desktop main keeps sole ownership of webContents**, matching the existing split.
- **No new discovery problem.** The agent/CLI never needs to find the desktop; host-service
  is the single addressable front door, and it learns the bridge address from its parent.

### 1. Bridge (desktop main)

New `BrowserBridge` HTTP+WS server in desktop main, bound `127.0.0.1`, free port, 32-byte-hex
bearer secret minted at boot (same pattern as `HOST_SERVICE_SECRET`). Passed to the host-service
child as `BROWSER_BRIDGE_URL` / `BROWSER_BRIDGE_SECRET`. Not written to any manifest — the only
client is the host-service child. Do **not** extend the unauthenticated notifications server.

Routes (thin wrappers over `browserManager`):
- `GET /panes?workspaceId=` — live panes: `{ paneId, workspaceId, url, title, isLoading }`
- `POST /panes/:paneId/navigate|back|forward|reload`
- `POST /panes/:paneId/screenshot` → base64 PNG (drop the clipboard side effect for bridge calls)
- `POST /panes/:paneId/eval` → `executeJavaScript` result
- `GET /panes/:paneId/console?since=` — the existing ring buffer
- `POST /open` — `{ workspaceId, url, target: "new-tab"|"current-tab" }` → forwards to renderer
  (see §3), waits for the resulting `browser.register`, returns the new `paneId`
- `WS /panes/:paneId/cdp` — raw CDP (see §4)

Prereq: `BrowserManager.register` must learn `workspaceId` (+ keep url/title current from the
existing navigation events). Renderer change: `browserRuntimeRegistry` passes `workspaceId` in
`browser.register`; main tracks `paneId → { webContentsId, workspaceId }`.

### 2. host-service `browser` router + CLI + MCP

New `packages/host-service/src/trpc/router/browser/` (protectedProcedure, like everything else):
`list`, `open`, `navigate`, `screenshot`, `eval`, `console` — pure proxies to the bridge. When
`BROWSER_BRIDGE_URL` is unset (standalone host), throw a descriptive error.

CLI group `packages/cli/src/commands/browser/`:

```
superset browser list      --workspace <id>
superset browser open      --workspace <id> --url <url> [--target new-tab|current-tab]
superset browser navigate  --workspace <id> --pane <id> --url <url>
superset browser screenshot --workspace <id> --pane <id> [--out shot.png]
superset browser eval      --workspace <id> --pane <id> --code '<js>'
superset browser console   --workspace <id> --pane <id> [--max-lines n]
superset browser cdp       --workspace <id> --pane <id>   # prints ws:// URL + token for tools
```

Same shape as `terminals *` (workspace-scoped, host-targeted via `--host`/`resolveHostTarget`).
MCP: mirror as `browser_list/open/navigate/screenshot/eval/console` in `packages/mcp` —
`terminals_read` is the template.

### 3. Opening/focusing panes (renderer hop)

Pane layout is renderer-owned; reuse the proven one-shot request pattern instead of inventing
external layout writes. Add a main→renderer tRPC subscription `browser.onOpenRequest`
(`{ workspaceId, url, target, requestId }`). A global renderer hook consumes it:
if the workspace route is active, call `openUrlInV2Workspace` directly; otherwise navigate with
the existing `openUrl`/`openUrlRequestId` search params. The bridge's `POST /open` resolves when
a `browser.register` arrives for a pane created with that request (timeout → clear error asking
the user to have the workspace open). v2-only; v1 is sunset.

### 4. Raw CDP (the browser-use part)

Per-pane: `webContents.debugger.attach("1.3")` on the **guest** webContents, then a message pump:
WS text frames in → `debugger.sendCommand(method, params, sessionId)`; `debugger.on("message")`
→ frames out. This yields the page-level domains automation needs: `Page`, `Runtime`, `DOM`,
`Input`, `Network`, `Emulation`, `Log`. Electron's debugger API supports flat session ids, so
OOPIF/worker sessions pass through.

Exposure path mirrors terminals: host-service WS route `/browser/:paneId/cdp` (wsAuth: bearer or
`?token=`) proxying frames to the bridge WS. Works locally and over the relay tunnel.

Compatibility ladder:
1. **Phase A (page-level):** the WS endpoint above. Enough for chrome-remote-interface,
   browser-use's direct-CDP client, and any tool that accepts a page `webSocketDebuggerUrl`.
   Also serve `GET /json/list` + `/json/version` on the bridge (proxied via a host-service HTTP
   route) listing one entry per pane so tools with target discovery just work.
2. **Phase B (browser-level facade, only if needed):** Playwright's `connectOverCDP` wants a
   browser target (`Target.getTargets`/`attachToTarget`, flatten). Synthesize it: targetIds =
   paneIds, attach lazily per pane. Ship only when a concrete consumer needs Playwright.

Operational details:
- **Debugger vs DevTools:** Chromium allows one debugger per target alongside DevTools only in
  recent versions via sessions — detach cleanly on WS close, and surface "DevTools is attached"
  errors verbatim if `attach()` throws.
- **LRU eviction:** hidden webviews are evicted after 3 (`MAX_HIDDEN_WEBVIEWS`). While a CDP
  session or bridge command stream is active, mark the pane eviction-exempt in
  `browserRuntimeRegistry` (bridge tells renderer via the same subscription channel); otherwise
  an agent driving a background workspace loses its target mid-run.
- **Screencast is out of scope** (the user already sees the pane; screenshots suffice for agents).

## Security model

- Bridge binds loopback, bearer-gated with a boot-minted secret held only by desktop main and its
  host-service child. Never in a world-readable manifest.
- External callers authenticate exactly as they do for terminals: local manifest PSK (0600) or
  relay-verified user JWT. No new auth surface, no new trust tier — an agent that can already run
  arbitrary shell in workspace terminals gains no privilege it didn't effectively have.
- The real new exposure is the **shared `persist:superset` cookie jar**: every pane shares it, so
  `eval`/CDP reach any session the user is logged into inside in-app browser panes (e.g. GitHub).
  Mitigations: (a) pane toolbar shows an "Agent controlling" badge while a bridge command/CDP
  session is active (event already flows through the registry); (b) a global setting
  `Allow agents to control browser panes` (default on — dogfooding an agent-first product; the
  toggle exists for shared machines) checked at the bridge; (c) `browser eval`/`cdp` calls are
  logged to the pane's console ring so the user can audit what ran.
- `sanitizeUrl` already rewrites non-URLs to Google search; keep it on the navigate path so
  agents can't hit `file://` or custom schemes via the pane.

## Phases

1. **Plumbing + high-level commands.** `workspaceId` in register; BrowserBridge server + env
   handoff; host-service `browser` router; CLI `browser list/open/navigate/screenshot/eval/console`;
   renderer open-request hook; controlling badge + setting. *Agents can already do most
   verification work with this alone.*
2. **Raw CDP page-level.** `webContents.debugger` pump, bridge WS, host-service WS proxy,
   `/json/list` shim, eviction exemption, `superset browser cdp`. Browser-use-class tools connect.
3. **MCP tools + docs.** Mirror the command set in `packages/mcp`; document the CDP endpoint for
   agent skills (`.agents/skills/`): prefer the pane bridge over `RENDERER_REMOTE_DEBUG_PORT`
   for anything that only needs the page.
4. **Optional: browser-level CDP facade** for Playwright `connectOverCDP`, driven by demand.

## Open questions

- Should `browser open` be able to create the workspace's first pane when the desktop is running
  but the workspace route was never visited (no `v2WorkspaceLocalState` row yet)? Phase 1 answers
  "workspace must be open or openable via deep link"; revisit if agents hit it often.
- Per-workspace vs global consent toggle. Global first; per-workspace adds schema for unclear gain.
- Whether `eval` should be kept once raw CDP ships (CDP `Runtime.evaluate` supersedes it) — keep
  both; `eval` is the ergonomic 90% path and already exists in `BrowserManager`.
