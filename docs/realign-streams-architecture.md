# Realign Architecture — SDK Runs Locally on Desktop

## Context

The original design has Claude SDK running locally on the desktop (access to user's filesystem, credentials, keychain). The current implementation mistakenly put the SDK on the Fly.io server via `apps/streams/src/claude-agent.ts`, meaning the proxy both manages durable streams AND runs the agent. This breaks when deployed — the SDK on Fly.io can't access the user's local files or credentials.

**Goal**: Move Claude Agent SDK execution from the streams server to a shared package consumed by desktop. The streams server becomes a pure durable streams layer (message persistence, SSE fan-out, auth). The desktop runs the SDK locally and writes streaming chunks back to the proxy.

## Architecture Principle

**Start simple, add abstraction when needed.** We're creating a shared `packages/agent` package that desktop consumes directly. When we need to support sandboxes or cloud workers in the future, we'll add abstraction layers then (follow the "three instances" heuristic).

## Migration Summary

1. **Create `packages/agent`** - Move agent logic from `apps/streams` to shared package
2. **Desktop consumes it** - Import `executeAgent()` and call with local context
3. **Streams becomes pure proxy** - Only handles chunk writing, SSE, session management
4. **Future**: Add abstraction layer when we have 2+ concrete use cases (desktop + sandbox, desktop + cloud worker, etc.)

## New Architecture

```
packages/agent/ (shared package)
├── agent-executor.ts       # Core SDK execution logic
├── sdk-to-ai-chunks.ts     # SDK event → stream chunk conversion
├── session-store.ts        # Session state management
├── permission-manager.ts   # Permission/approval handling
└── types.ts                # Shared types

Desktop (Electron main process)
├── Imports @superset/agent
├── Calls executeAgent() with local context (cwd, env, credentials)
├── POSTs each chunk to proxy: POST /v1/sessions/:id/chunks
├── Handles permissions/approvals locally via tRPC events
└── Uses user's local credentials (buildClaudeEnv — keychain, config, env)

Streams Proxy (Fly.io) — pure durable streams
├── Session management (create, delete, fork)
├── Chunk-writing endpoint (NEW — accepts chunks from desktop)
├── SSE fan-out to all clients
├── Auth middleware (Bearer token on /v1/*)
└── Stop generation (aborts active generation controllers)
```

## Chunk Flow

```
1. User sends message → Desktop writes to proxy (existing POST /messages)
2. Desktop runs SDK locally with user's cwd + credentials
3. For each SDK event → convert to StreamChunk → POST /v1/sessions/:id/chunks
4. Proxy writes chunk to durable stream → SSE fan-out to all clients
5. Stop → Desktop calls tRPC interrupt → aborts local AbortController → SDK stops
```

---

## Part A: Streams Server Changes (remove agent, add chunk endpoint)

### A1. Delete agent-specific files from `apps/streams/src/`

| File | Reason |
|------|--------|
| `claude-agent.ts` | Moves to `packages/agent` |
| `sdk-to-ai-chunks.ts` | Moves to `packages/agent` |
| `claude-session-store.ts` | Moves to `packages/agent` |
| `notification-hooks.ts` | Delete (desktop emits events directly, no HTTP webhooks) |
| `permission-manager.ts` | Moves to `packages/agent` |

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

## Part B: Create Shared Agent Package

### B1. Create `packages/agent/` structure

New package: `packages/agent/`

```
packages/agent/
├── package.json
├── tsconfig.json
├── src/
│   ├── agent-executor.ts       # Main entry — executeAgent()
│   ├── sdk-to-ai-chunks.ts     # From apps/streams (as-is)
│   ├── session-store.ts        # From apps/streams (make storage path configurable)
│   ├── permission-manager.ts   # From apps/streams (as-is)
│   ├── types.ts                # Shared types
│   └── index.ts                # Barrel export
└── README.md
```

### B2. Move files from `apps/streams/src/` to `packages/agent/src/`

| Source File | Destination | Changes |
|-------------|-------------|---------|
| `claude-agent.ts` | `agent-executor.ts` | Strip Hono HTTP server, keep core `query()` logic |
| `sdk-to-ai-chunks.ts` | `sdk-to-ai-chunks.ts` | Move as-is (pure conversion logic) |
| `claude-session-store.ts` | `session-store.ts` | Make storage path configurable (inject via constructor) |
| `permission-manager.ts` | `permission-manager.ts` | Move as-is (in-memory promise pattern) |

### B3. `agent-executor.ts` interface

```typescript
export interface ExecuteAgentParams {
  sessionId: string;
  prompt: string;
  model?: string;
  cwd: string;
  env: Record<string, string>;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";

  // Callbacks for environment-specific behavior
  onChunk: (chunk: StreamChunk) => Promise<void>;
  onPermissionRequest?: (params: PermissionRequestParams) => Promise<PermissionResult>;
  onEvent?: (event: AgentEvent) => void;

  // Optional
  resume?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxBudgetUsd?: number;
  signal?: AbortSignal;
}

export async function executeAgent(params: ExecuteAgentParams): Promise<void> {
  // 1. Get claudeSessionId from session store (for resume)
  // 2. Build SDK options from params
  // 3. Create converter with onChunk callback
  // 4. Call query() with options
  // 5. Handle errors, cleanup
}
```

### B4. `packages/agent/package.json`

```json
{
  "name": "@superset/agent",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.38",
    "zod": "^4.3.5"
  }
}
```

---

## Part C: Desktop Integration

### C1. Update session manager

`apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager.ts`:

```typescript
import { executeAgent } from "@superset/agent";

class SessionManager {
  private runningAgents = new Map<string, AbortController>();

  async startAgent(sessionId: string, prompt: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    const controller = new AbortController();
    this.runningAgents.set(sessionId, controller);

    try {
      await executeAgent({
        sessionId,
        prompt,
        cwd: session.cwd,
        env: buildClaudeEnv(),
        model: session.model,
        permissionMode: session.permissionMode,
        signal: controller.signal,

        // Write chunks to streams server
        onChunk: async (chunk) => {
          await fetch(`${this.streamsUrl}/v1/sessions/${sessionId}/chunks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.authToken}`,
            },
            body: JSON.stringify({
              messageId: chunk.messageId,
              actorId: "claude",
              role: "assistant",
              chunk,
            }),
          });
        },

        // Handle permissions locally via tRPC
        onPermissionRequest: async (params) => {
          return this.requestPermission(sessionId, params);
        },

        // Emit events for renderer
        onEvent: (event) => {
          this.eventEmitter.emit("agent-event", { sessionId, event });
        },
      });
    } finally {
      this.runningAgents.delete(sessionId);
    }
  }

  async stopAgent(sessionId: string) {
    const controller = this.runningAgents.get(sessionId);
    if (controller) {
      controller.abort();
    }
  }

  private async requestPermission(
    sessionId: string,
    params: PermissionRequestParams
  ): Promise<PermissionResult> {
    // Create permission request, emit event to renderer
    // Wait for tRPC mutation response
    // Return PermissionResult ({ behavior: "allow" | "deny", ... })
  }
}
```

### C2. Delete `agent-provider/` directory

Remove `apps/desktop/src/lib/trpc/routers/ai-chat/utils/agent-provider/`:
- `claude-sdk-provider.ts` — replaced by direct `executeAgent()` calls
- `types.ts` — `AgentProvider`, `AgentRegistration` interfaces no longer needed
- `index.ts` — barrel export

### C3. Update tRPC router

Add mutations for local permission handling:

```typescript
export const aiChatRouter = router({
  // ... existing routes

  approveToolUse: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      toolUseId: z.string(),
      approved: z.boolean(),
      updatedInput: z.record(z.unknown()).optional(),
    }))
    .mutation(({ input }) => {
      // Resolve permission in session manager
      sessionManager.resolvePermission(input.sessionId, input.toolUseId, {
        approved: input.approved,
        updatedInput: input.updatedInput,
      });
    }),

  interrupt: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ input }) => {
      sessionManager.interrupt({ sessionId: input.sessionId });
    }),
});
```

### C4. Add package dependency

Add to `apps/desktop/package.json`:

```json
{
  "dependencies": {
    "@superset/agent": "workspace:*"
  }
}
```

---

## Permission/Approval Flow (Local)

Old: SDK → agent endpoint (Fly.io) → SSE to proxy → client → HTTP back → resolve
New: SDK → `onPermissionRequest` callback (local) → tRPC event → renderer UI → tRPC mutation → resolve

1. SDK calls `onPermissionRequest()` callback on desktop
2. Callback creates a pending permission promise and emits event
3. Permission request chunk is written to proxy → renderer sees it via SSE
4. User approves/denies in renderer UI
5. Renderer calls `approveToolUse` tRPC mutation
6. Mutation resolves pending permission promise locally
7. SDK continues
8. Also write approval chunk to proxy so other clients see it

## Stop Generation Flow

- **From desktop**: `runner.interrupt()` → abort local AbortController → SDK stops → also calls proxy `/stop` as fallback
- **From web/mobile**: Not yet implemented (proxy `/stop` endpoint exists but has no effect on desktop agent — requires future cross-client signaling)

---

## Part D: Future Extensibility (When Needed)

When we add sandboxes or cloud workers, we'll introduce abstraction layers:

```
packages/agent-runtime/          # Future: abstraction layer
├── runtime/
│   ├── agent-runtime.ts        # Interface: AgentRuntime
│   └── base-runtime.ts         # Base implementation
├── transports/
│   ├── http-transport.ts       # POST chunks via HTTP
│   └── ipc-transport.ts        # Write via tRPC
└── environments/
    ├── desktop-context.ts      # Desktop capabilities
    └── sandbox-context.ts      # Sandbox capabilities

apps/desktop/ → uses DesktopAgentRuntime
apps/sandbox-worker/ → uses SandboxAgentRuntime
```

**Don't build this yet.** Only add it when we have concrete requirements for 2+ environments. See "three instances" heuristic in AGENTS.md.

---

## Verification

1. **Shared package builds:**
   ```bash
   cd packages/agent
   bun run typecheck  # Should compile without errors
   ```

2. **Desktop imports and runs agent:**
   ```typescript
   import { executeAgent } from "@superset/agent";
   // Should have type inference for all params
   ```

3. **Proxy works as pure durable stream layer:**
   ```bash
   curl http://localhost:8080/health  # 200
   curl -H "Authorization: Bearer $TOKEN" -X PUT http://localhost:8080/v1/sessions/test
   curl -H "Authorization: Bearer $TOKEN" -X POST http://localhost:8080/v1/sessions/test/chunks \
     -d '{"messageId":"m1","actorId":"claude","role":"assistant","chunk":{"type":"text-delta","textDelta":"Hi"}}'
   ```

4. **Desktop runs SDK locally:**
   - Start desktop + streams, open chat, send message
   - Desktop console shows `[agent/executor] Running query...`
   - Chunks POST to `/v1/sessions/:id/chunks`
   - Chunks appear in durable stream SSE
   - Response renders in UI

5. **Permissions work locally:**
   - Set permission mode to "default", trigger tool use
   - `onPermissionRequest` callback fires → tRPC event emitted
   - Approval UI appears in renderer
   - User approves → tRPC mutation → promise resolves
   - SDK continues execution

6. **Stop works across clients:**
   - Start generation → call tRPC `interrupt` mutation → `sessionManager.interrupt()` → AbortController aborts → SDK stops
