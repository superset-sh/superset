# Realign Architecture — SDK Runs Locally on Desktop

## Context

The original design has Claude SDK running locally on the desktop (access to user's filesystem, credentials, keychain). The current implementation mistakenly put the SDK on the Fly.io server via `apps/streams/src/claude-agent.ts`, meaning the proxy both manages durable streams AND runs the agent. This breaks when deployed — the SDK on Fly.io can't access the user's local files or credentials.

**Goal**: Move Claude Agent SDK execution from the streams server to the desktop Electron main process. The streams server becomes a pure durable streams layer (message persistence, SSE fan-out, auth). The desktop runs the SDK locally and writes streaming chunks back to the proxy.

## New Architecture

```
Desktop (Electron main process)
├── Runs query() from @anthropic-ai/claude-agent-sdk locally
├── Converts SDK messages → chunks (sdk-to-ai-chunks.ts)
├── POSTs each chunk to proxy: POST /v1/sessions/:id/chunks
├── Handles permissions/approvals locally via tRPC events
└── Uses user's local credentials (buildClaudeEnv — keychain, config, env)

Streams Proxy (Fly.io) — pure durable streams
├── Session management (create, delete, fork)
├── Chunk-writing endpoint (NEW — accepts chunks from desktop)
├── SSE fan-out to all clients
├── Auth middleware (Bearer token on /v1/*)
└── Stop generation (writes stop chunk, desktop detects via SSE)
```

## Chunk Flow

```
1. User sends message → Desktop writes to proxy (existing POST /messages)
2. Desktop runs SDK locally with user's cwd + credentials
3. For each SDK event → convert to StreamChunk → POST /v1/sessions/:id/chunks
4. Proxy writes chunk to durable stream → SSE fan-out to all clients
5. Stop from any client → proxy writes stop chunk → Desktop detects via SSE → aborts SDK
```

---

## Part A: Streams Server Changes (remove agent, add chunk endpoint)

### A1. Delete agent-specific files from `apps/streams/src/`

| File | Reason |
|------|--------|
| `claude-agent.ts` | Moves to desktop |
| `sdk-to-ai-chunks.ts` | Moves to desktop |
| `claude-session-store.ts` | Moves to desktop |
| `notification-hooks.ts` | Moves to desktop (simplified — direct events, no HTTP webhooks) |
| `permission-manager.ts` | Moves to desktop |

### A2. Clean up `env.ts`

Remove `ANTHROPIC_API_KEY` and `STREAMS_AGENT_PORT` — no longer needed on server.

### A3. Clean up `index.ts`

Remove the agent HTTP server (`agentServer` on `STREAMS_AGENT_PORT`). Keep only the proxy server.

### A4. Clean up `protocol.ts`

Remove server-side agent invocation methods:
- `setupReactiveAgentTrigger()` — desktop handles trigger
- `invokeAgent()` — desktop runs SDK directly
- `streamAgentResponse()` — desktop writes chunks via HTTP
- `notifyRegisteredAgents()` — desktop handles trigger

**Keep**: `writeChunk`, `writeUserMessage`, `writeToolResult`, `writeApprovalResponse`, agent registration methods (future web use), `stopGeneration`, session management, forking.

### A5. Add chunk-writing route

New `POST /v1/sessions/:id/chunks` endpoint in routes:

```typescript
// Accepts: { messageId, actorId, role, chunk, txid? }
// Calls protocol.writeChunk() — reuses existing durable stream write logic
```

Also add generation lifecycle endpoints:
```
POST /v1/sessions/:id/generations/start  → { messageId }  (creates messageId, tracks active)
POST /v1/sessions/:id/generations/finish → 204             (clears active generation)
```

### A6. Update env / CI files

| File | Change |
|------|--------|
| `.env` | Remove `STREAMS_AGENT_PORT` |
| `.env.example` | Remove `STREAMS_AGENT_PORT` |
| `.github/workflows/deploy-production.yml` | Remove `ANTHROPIC_API_KEY` from `flyctl secrets set` |
| `.github/workflows/deploy-preview.yml` | Remove `ANTHROPIC_API_KEY` from secrets |

---

## Part B: Desktop Changes (add local SDK execution)

### B1. Create `claude-runner/` module

New directory: `apps/desktop/src/lib/trpc/routers/ai-chat/utils/claude-runner/`

| File | Source | Notes |
|------|--------|-------|
| `claude-runner.ts` | New | Core module — calls `query()`, converts chunks, POSTs to proxy |
| `sdk-to-ai-chunks.ts` | From `apps/streams/` | Move as-is — pure conversion logic |
| `claude-session-store.ts` | From `apps/streams/` | Change data dir to `app.getPath('userData')` |
| `permission-manager.ts` | From `apps/streams/` | Move as-is — same in-memory promise pattern |
| `index.ts` | New | Barrel export |

`notification-hooks.ts` is NOT moved — desktop doesn't need HTTP webhooks to notify itself. SDK hooks can emit events directly via the session manager's EventEmitter.

### B2. `ClaudeRunner` implementation

```typescript
export class ClaudeRunner {
  async runQuery({ sessionId, cwd, prompt, model, permissionMode, onEvent }): Promise<void> {
    // 1. POST /v1/sessions/:id/generations/start → { messageId }
    // 2. buildClaudeEnv() for user's local credentials
    // 3. Resolve claudeSessionId from local store (for resume)
    // 4. query({ prompt, options: { resume, cwd, model, env, canUseTool, ... } })
    // 5. For each SDK message → convert → POST /v1/sessions/:id/chunks
    // 6. POST /v1/sessions/:id/generations/finish
  }

  interrupt(): void {
    // Abort SDK via AbortController
  }
}
```

Key differences from server-side `claude-agent.ts`:
- No Hono HTTP server — called directly from session manager
- Uses `buildClaudeEnv()` for user's local credentials (already exists)
- Writes chunks via HTTP to proxy (not internal `protocol.writeChunk`)
- Permissions handled locally via tRPC events

### B3. Update session manager

`session-manager.ts` changes:
- Remove `AgentProvider` dependency and agent registration calls
- Own a `ClaudeRunner` instance
- `ensureSessionReady()` — only creates session on proxy (`PUT /v1/sessions/:id`), no agent registration
- New method to trigger SDK when user sends message
- Listen for stop chunks from durable stream SSE to abort local runner

### B4. Delete `agent-provider/` directory

The entire `agent-provider/` directory is no longer needed:
- `claude-sdk-provider.ts` — replaced by `ClaudeRunner`
- `types.ts` — `AgentProvider`, `AgentRegistration` interfaces no longer used
- `index.ts` — barrel export

### B5. Update tRPC router

Add mutations for local permission handling:
- `approveToolUse` — resolves pending permission promise locally
- `answerToolQuestion` — resolves pending question promise locally

The existing `streamEvents` subscription already handles emitting events to the renderer — `ClaudeRunner` emits approval-requested events through it.

### B6. Add SDK dependency

Add `@anthropic-ai/claude-agent-sdk` to `apps/desktop/package.json`.

---

## Permission/Approval Flow (Local)

Old: SDK → agent endpoint (Fly.io) → SSE to proxy → client → HTTP back → resolve
New: SDK → `canUseTool` callback (local) → tRPC event → renderer UI → tRPC mutation → resolve

1. SDK calls `canUseTool()` callback on desktop
2. Callback emits tRPC event: `{ type: "approval_requested", toolName, input, toolUseId }`
3. Renderer receives via existing `streamEvents` subscription
4. User approves/denies
5. Renderer calls `approveToolUse` tRPC mutation
6. Mutation resolves local `permissionManager` promise
7. SDK continues
8. Also write approval chunk to proxy so other clients see it

## Stop Generation Flow

- **From desktop**: `runner.interrupt()` → abort SDK → write stop chunk to proxy
- **From web/mobile**: `POST /v1/sessions/:id/stop` → proxy writes stop chunk → desktop detects via SSE → `runner.interrupt()`

---

## Verification

1. **Proxy works as pure durable stream layer:**
   ```bash
   curl http://localhost:8080/health  # 200
   curl -H "Authorization: Bearer $TOKEN" -X PUT http://localhost:8080/v1/sessions/test
   curl -H "Authorization: Bearer $TOKEN" -X POST http://localhost:8080/v1/sessions/test/chunks \
     -d '{"messageId":"m1","actorId":"claude","role":"assistant","chunk":{"type":"text-delta","textDelta":"Hi"}}'
   ```

2. **Desktop runs SDK locally:**
   - Start desktop + streams, open chat, send message
   - Desktop console shows `[claude/runner] Running query...`
   - Chunks appear in durable stream SSE
   - Response renders in UI

3. **Permissions work locally:**
   - Set permission mode to "default", trigger tool use
   - Approval UI appears, approve → SDK continues

4. **Stop works across clients:**
   - Start generation → stop from desktop → stops
   - Start generation → stop via API → desktop detects stop chunk → stops
