# Terminal WebSocket: Create session via tRPC, connect as data pipe

## Problem

WebSocket URL includes `workspaceId`, `themeType` as query params. When workspace context changes, the URL changes, causing spurious reconnects that garble rendering. PR #3252 works around this.

## Fix

Create the PTY session via tRPC first. WebSocket becomes a data pipe — no session creation logic, no query params beyond auth token.

### Flow

```
1. Client generates terminalId (crypto.randomUUID) — already done in pane data
2. tRPC: terminal.createSession({ terminalId, workspaceId, themeType, cols, rows })
   → host-service creates PTY, returns { status, scrollback? }
3. WebSocket: ws://host/terminal/{terminalId}?token=Z
   → attaches to existing session, forwards data
```

Session already exists when the socket opens. No race conditions — PTY is ready before any data flows.

### Host-service (`terminal.ts`)

**`terminal.createSession` tRPC procedure (new):**
- Calls existing `createTerminalSessionInternal()` — no new logic
- Returns `{ terminalId, status }` or error
- Idempotent: if session already exists, returns it

**WebSocket `onOpen` (simplified):**
- Look up session by terminalId
- If exists → attach socket, replay buffer
- If not exists → close with error (client must call createSession first)
- No more reading `workspaceId`/`themeType` from query params
- No more calling `createTerminalSessionInternal()` from WS handler

### Renderer

| File | What |
|------|------|
| `TerminalPane.tsx` | Drop `workspaceId`/`themeType` from URL. Remove `websocketUrlRef`, separate reconnect effect. Call `createSession` tRPC before attach. |
| `terminal-ws-transport.ts` | Remove `baseUrl()` hack. Remove `sendResize` on open (cols/rows sent via tRPC). |
| `terminal-runtime-registry.ts` | `attach()` calls `createSession` tRPC, then `connect()`. |

### Cleanup

- `websocketUrlRef` in TerminalPane
- Separate reconnect effect in TerminalPane
- `baseUrl()` helper in terminal-ws-transport
- `IMPORTANT` comments about effect deps
- Session creation logic in host-service WS `onOpen`
- `workspaceId`/`themeType` query param handling in WS handler
