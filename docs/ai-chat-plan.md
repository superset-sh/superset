# Multiplayer AI Chat with Claude Code

Build a real-time multiplayer AI chat powered by Claude Code SDK with Durable Streams for token streaming.

## Architecture

```
Any Client (Web/Desktop/Mobile)
┌──────────────────────────────────────────────────────────┐
│  useDurableChat()                                        │
│  @superset/durable-session (vendored)                    │
│                                                          │
│  DurableChatClient                                       │
│    → collections.messages (reactive, materialized)       │
│    → collections.presence                                │
│    → collections.activeGenerations                       │
│    → sendMessage() (optimistic insert + POST to proxy)   │
└───────────┬──────────────────────────────────────────────┘
            │ HTTP
            ▼
┌──────────────────────────────────────────────────────────┐
│  Durable Session Proxy (apps/streams, port 8080)         │
│  @superset/durable-session-proxy (vendored from          │
│   electric-sql/transport)                                │
│                                                          │
│  Hono routes:                                            │
│    PUT    /v1/sessions/:id              Create session    │
│    POST   /v1/sessions/:id/messages     Send message      │
│    POST   /v1/sessions/:id/agents       Register agent    │
│    POST   /v1/sessions/:id/stop         Stop generation   │
│    GET    /v1/stream/sessions/:id       SSE stream proxy  │
│                                                          │
│  AIDBSessionProtocol                                     │
│    → writeUserMessage() to durable stream                │
│    → notifyRegisteredAgents() on new user message        │
│    → writeChunk() for each agent SSE chunk               │
│    → stopGeneration() via AbortController                │
│                                                          │
│  ┌────────────────────────────────────────────────┐      │
│  │ DurableStreamTestServer (internal port 8081)    │      │
│  │ @durable-streams/server                         │      │
│  │ LMDB + append-only logs                         │      │
│  └────────────────────────────────────────────────┘      │
└───────────┬──────────────────────────────────────────────┘
            │ HTTP (agent invocation)
            ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Agent Endpoint (apps/streams/src/claude-agent.ts)│
│                                                          │
│  POST / receives { messages } from proxy                 │
│    → Extracts latest user message                        │
│    → Runs query() from @anthropic-ai/claude-agent-sdk    │
│    → Converts SDKMessage → TanStack AI SSE chunks        │
│    → Returns SSE response                                │
│    → Manages multi-turn resume via claudeSessionId       │
│                                                          │
│  SDK Message Conversion (sdk-to-ai-chunks.ts):           │
│    stream_event (text_delta)      → text-delta chunk     │
│    stream_event (tool_use start)  → tool-call-start      │
│    stream_event (input_json_delta)→ tool-call-delta      │
│    stream_event (thinking_delta)  → reasoning chunk      │
│    user (tool_result)             → tool-result chunk    │
│    result                         → finish chunk         │
└──────────────────────────────────────────────────────────┘
```

### Message Flow

1. Client calls `sendMessage("fix the bug")` via `useDurableChat`
2. Optimistic insert into local `chunks` collection (instant UI update)
3. POST to proxy `/v1/sessions/:id/messages`
4. Proxy writes user message chunk to durable stream
5. Proxy detects new user message, calls registered Claude agent endpoint
6. Agent runs `query()` with Claude SDK, streams SSE chunks back
7. Proxy writes each chunk to durable stream with `messageId` + `seq`
8. Client's `SessionDB` syncs new chunks via SSE
9. `messages` collection auto-rematerializes → UI updates reactively

## Key Design Decisions

1. **Vendor `@electric-sql/durable-session`** — Not published to npm. Vendored from [electric-sql/transport](https://github.com/electric-sql/transport) into `packages/durable-session/` (~20 files). Required compatibility fixes for unreleased `@tanstack/db` aggregates (`collect`, `minStr`) and `@tanstack/ai` types. Gives us reactive collections, optimistic mutations, TanStack AI compatibility.
2. **Proxy pattern** — Proxy handles message writing, agent invocation, stream fan-out. Clients never write to durable stream directly.
3. **Agent endpoint** — Claude SDK runs as an "agent" the proxy calls via HTTP. Agent handles entire tool loop server-side. Returns standard TanStack AI SSE chunks.
4. **TanStack AI message format** — Messages use `parts: MessagePart[]` (TextPart, ToolCallPart, ToolResultPart, ThinkingPart) not Anthropic-specific `BetaContentBlock[]`. SDK output converted at the agent boundary.
5. **Postgres for completed messages** — Single write on completion, Electric syncs history. Durable stream is the live source of truth during streaming.
6. **`@tanstack/ai` for materialization** — Official `StreamProcessor` handles chunk accumulation. No custom materialization needed.

## Claude SDK Streaming Format

The Claude Agent SDK emits `SDKMessage` objects when `includePartialMessages: true`:

```typescript
// Types: system, stream_event, assistant, user, result
type SDKMessage =
  | { type: 'system'; subtype: 'init'; session_id: string }
  | { type: 'stream_event'; event: RawMessageStreamEvent }
  | { type: 'assistant'; message: { content: BetaContentBlock[] } }
  | { type: 'user'; message: { content: ToolResultBlock[] } }
  | { type: 'result'; ... }
```

The agent endpoint converts these to TanStack AI `StreamChunk` format before writing to the durable stream. This is a one-way conversion at the write boundary — clients never see raw SDK messages.

---

## Status

| Component | Status |
|-----------|--------|
| Claude binary download | DONE — `apps/desktop/scripts/download-claude-binary.ts` |
| Auth (buildClaudeEnv) | DONE — `apps/desktop/src/lib/trpc/routers/ai-chat/utils/auth/auth.ts` |
| Session manager (v1) | DONE — `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts` |
| Desktop tRPC router | DONE — `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts` |
| Durable stream server (v1) | DONE — `apps/streams/` (vendored proxy from electric-sql/transport) |
| Vendored durable-session client | DONE — `packages/durable-session/` (vendored from electric-sql/transport) |
| React hook (useDurableChat) | DONE — `packages/durable-session/src/react/use-durable-chat.ts` |
| ChatInput component | DONE — `packages/durable-session/src/react/components/ChatInput/` |
| PresenceBar component | DONE — `packages/durable-session/src/react/components/PresenceBar/` |
| Old ai-chat package | REMOVED — replaced by `@superset/durable-session` |
| Vendored proxy (A2) | DONE — `apps/streams/src/` (vendored from electric-sql/transport, JSON.stringify fix for DurableStream.append) |
| Claude agent endpoint (B) | DONE — `apps/streams/src/claude-agent.ts` + `apps/streams/src/sdk-to-ai-chunks.ts` |
| Database schema | NOT BUILT |
| API chat router | NOT BUILT |
| Desktop chat UI (renderer) | NOT BUILT |
| Web chat UI | NOT BUILT |
| Message rendering component | NOT BUILT |

---

## Phase A: Vendor `@electric-sql/durable-session`

Source: [electric-sql/transport](https://github.com/electric-sql/transport) (unpublished, Apache-2.0)

Reference source cloned to `/tmp/electric-sql-transport/` via:
```bash
git clone https://github.com/electric-sql/transport.git /tmp/electric-sql-transport
```

### A1. Create `packages/durable-session/` — DONE

Vendor from `packages/durable-session` + `packages/react-durable-session` in the transport repo.

#### File-by-File Vendoring Reference

| Source (in `/tmp/electric-sql-transport/`) | Destination | Import Changes |
|---|---|---|
| `packages/durable-session/src/index.ts` | `packages/durable-session/src/index.ts` | None (relative imports) |
| `packages/durable-session/src/client.ts` | `packages/durable-session/src/client.ts` | None (relative imports) |
| `packages/durable-session/src/collection.ts` | `packages/durable-session/src/collection.ts` | None (relative imports) |
| `packages/durable-session/src/materialize.ts` | `packages/durable-session/src/materialize.ts` | None (relative imports) |
| `packages/durable-session/src/schema.ts` | `packages/durable-session/src/schema.ts` | None (relative imports) |
| `packages/durable-session/src/types.ts` | `packages/durable-session/src/types.ts` | None (relative imports) |
| `packages/durable-session/src/collections/index.ts` | `packages/durable-session/src/collections/index.ts` | None |
| `packages/durable-session/src/collections/messages.ts` | `packages/durable-session/src/collections/messages.ts` | None |
| `packages/durable-session/src/collections/active-generations.ts` | `packages/durable-session/src/collections/active-generations.ts` | None |
| `packages/durable-session/src/collections/session-meta.ts` | `packages/durable-session/src/collections/session-meta.ts` | None |
| `packages/durable-session/src/collections/session-stats.ts` | `packages/durable-session/src/collections/session-stats.ts` | None |
| `packages/durable-session/src/collections/model-messages.ts` | `packages/durable-session/src/collections/model-messages.ts` | None |
| `packages/durable-session/src/collections/presence.ts` | `packages/durable-session/src/collections/presence.ts` | None |
| `packages/react-durable-session/src/index.ts` | `packages/durable-session/src/react/index.ts` | `@electric-sql/durable-session` → `../` |
| `packages/react-durable-session/src/types.ts` | `packages/durable-session/src/react/types.ts` | `@electric-sql/durable-session` → `../` |
| `packages/react-durable-session/src/use-durable-chat.ts` | `packages/durable-session/src/react/use-durable-chat.ts` | `@electric-sql/durable-session` → `../` |

**Specific import changes in react files:**
```typescript
// BEFORE (in react-durable-session source):
import { DurableChatClient, messageRowToUIMessage } from '@electric-sql/durable-session'
import type { DurableChatClientOptions } from '@electric-sql/durable-session'

// AFTER (in packages/durable-session/src/react/):
import { DurableChatClient, messageRowToUIMessage } from '..'
import type { DurableChatClientOptions } from '..'
```

```typescript
// BEFORE (react index.ts re-exports):
export { DurableChatClient, ... } from '@electric-sql/durable-session'

// AFTER:
export { DurableChatClient, ... } from '..'
```

#### Package Configuration

**`packages/durable-session/package.json`:**
```json
{
  "name": "@superset/durable-session",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./react": {
      "types": "./src/react/index.ts",
      "default": "./src/react/index.ts"
    }
  },
  "dependencies": {
    "@durable-streams/state": "^0.2.0",
    "@standard-schema/spec": "^1.0.0",
    "@tanstack/ai": "^0.3.0",
    "@tanstack/db": "^0.5.22",
    "@tanstack/db-ivm": "^0.1.17",
    "zod": "^4.1.12"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "@tanstack/react-db": "^0.1.66"
  }
}
```

**`packages/durable-session/tsconfig.json`:**
```json
{
  "extends": "@superset/typescript-config/react-library.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

#### Key Internals to Understand

**Schema** (`schema.ts`) — Three STATE-PROTOCOL collections:
```typescript
export const sessionStateSchema = createStateSchema({
  chunks: {
    schema: chunkValueSchema,    // messageId, actorId, role, chunk (JSON), seq, createdAt
    type: 'chunk',
    primaryKey: 'id',            // Injected from event.key = `${messageId}:${seq}`
    allowSyncWhilePersisting: true,
  },
  presence: {
    schema: presenceValueSchema, // actorId, deviceId, actorType, name?, status, lastSeenAt
    type: 'presence',
    primaryKey: 'id',            // Injected from event.key = `${actorId}:${deviceId}`
  },
  agents: {
    schema: agentValueSchema,    // agentId, name?, endpoint, triggers?
    type: 'agent',
    primaryKey: 'agentId',
  },
})
```

**Materialization pipeline** (`materialize.ts`):
- Uses `StreamProcessor` from `@tanstack/ai` (the key dependency)
- Two paths: `WholeMessageChunk` (type: 'whole-message') for user msgs, `StreamChunk[]` for assistant msgs
- `parseChunk(row.chunk)` → JSON.parse the chunk field
- `materializeWholeMessage()` → extract UIMessage from chunk, return MessageRow
- `materializeAssistantMessage()` → sort chunks by seq, feed to StreamProcessor, get parts
- `isDoneChunk()` / stop/error chunk types mark `isComplete: true`

**Collection pipeline** (`collections/messages.ts`):
```
chunks → groupBy(messageId) + count(chunk) + min(createdAt)
       → orderBy(startedAt, 'asc')
       → fn.select(imperatively gather chunks → materializeMessage(rows))
       → getKey: row.id
```

Derived collections use `.fn.where()`:
- `toolCalls`: `parts.some(p => p.type === 'tool-call')`
- `pendingApprovals`: `parts.some(p => p.type === 'tool-call' && p.approval?.needsApproval && p.approval.approved === undefined)`
- `toolResults`: `parts.some(p => p.type === 'tool-result')`
- `activeGenerations`: `!message.isComplete` → maps to `ActiveGenerationRow`

**Session DB factory** (`collection.ts`):
```typescript
const streamUrl = `${baseUrl}/v1/stream/sessions/${sessionId}`
const rawDb = createStreamDB({
  streamOptions: { url: streamUrl, headers, signal },
  state: sessionStateSchema,
})
```

**Chunk key format**: `${messageId}:${seq}` — e.g., "msg-1:0", "msg-2:5"

**React hook** (`react/use-durable-chat.ts`):
- `useCollectionData()` — SSR-safe collection subscription using `useSyncExternalStore`
- Client created synchronously in render (ref-cached by `${sessionId}:${proxyUrl}` key)
- Handles Strict Mode: checks `client.isDisposed` and recreates if needed
- Auto-connects on mount if `autoConnect: true` (default)
- Returns TanStack AI-compatible API: messages, sendMessage, isLoading, etc.

#### Compatibility Fixes Applied

The transport repo uses `workspace:*` (unreleased local versions) of `@tanstack/db`, `@tanstack/ai`, and `@durable-streams/state`. The published npm versions differ, requiring these fixes:

| Issue | Fix |
|-------|-----|
| `collect` aggregate not in `@tanstack/db` v0.5.22 | Rewrote `messages.ts`, `session-stats.ts`, `presence.ts` to use `groupBy + count` as change discriminator + `fn.select` with imperative collection filtering |
| `minStr` aggregate not in `@tanstack/db` v0.5.22 | Replaced with `min()` which handles strings at runtime |
| `DoneStreamChunk` not in `@tanstack/ai` v0.3.0 | Replaced with `chunk.type === 'RUN_FINISHED'` type guard |
| `LiveMode` not in `@durable-streams/state` v0.2.1 | Removed import and re-export (was already unused in practice) |

#### UI Components Migrated

`ChatInput` and `PresenceBar` from the old `packages/ai-chat` were moved into `packages/durable-session/src/react/components/`. They are exported from `@superset/durable-session/react`:

```typescript
import { ChatInput, PresenceBar } from '@superset/durable-session/react'
```

The old `packages/ai-chat` package has been fully removed.

### A2. Vendor proxy into `apps/streams/` — DONE

Vendor from `packages/durable-session-proxy` in the transport repo.

#### File-by-File Vendoring Reference

| Source (in `/tmp/electric-sql-transport/`) | Destination | Import Changes |
|---|---|---|
| `packages/durable-session-proxy/src/index.ts` | `packages/durable-session-proxy/src/index.ts` (re-exports only, keep for reference) | N/A |
| `packages/durable-session-proxy/src/server.ts` | `apps/streams/src/server.ts` | `@electric-sql/durable-session` → `@superset/durable-session` |
| `packages/durable-session-proxy/src/protocol.ts` | `apps/streams/src/protocol.ts` | `@electric-sql/durable-session` → `@superset/durable-session` |
| `packages/durable-session-proxy/src/types.ts` | `apps/streams/src/types.ts` | `@electric-sql/durable-session` → `@superset/durable-session` |
| `packages/durable-session-proxy/src/handlers/index.ts` | `apps/streams/src/handlers/index.ts` | None |
| `packages/durable-session-proxy/src/handlers/send-message.ts` | `apps/streams/src/handlers/send-message.ts` | None (relative) |
| `packages/durable-session-proxy/src/handlers/invoke-agent.ts` | `apps/streams/src/handlers/invoke-agent.ts` | None (relative) |
| `packages/durable-session-proxy/src/handlers/stream-writer.ts` | `apps/streams/src/handlers/stream-writer.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/index.ts` | `apps/streams/src/routes/index.ts` | None |
| `packages/durable-session-proxy/src/routes/sessions.ts` | `apps/streams/src/routes/sessions.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/messages.ts` | `apps/streams/src/routes/messages.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/agents.ts` | `apps/streams/src/routes/agents.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/stream.ts` | `apps/streams/src/routes/stream.ts` | None |
| `packages/durable-session-proxy/src/routes/tool-results.ts` | `apps/streams/src/routes/tool-results.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/approvals.ts` | `apps/streams/src/routes/approvals.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/health.ts` | `apps/streams/src/routes/health.ts` | None |
| `packages/durable-session-proxy/src/routes/auth.ts` | `apps/streams/src/routes/auth.ts` | None (relative) |
| `packages/durable-session-proxy/src/routes/fork.ts` | `apps/streams/src/routes/fork.ts` | None (relative) |

**Import change in proxy files** (3 files: `server.ts`, `protocol.ts`, `types.ts`):
```typescript
// BEFORE:
import { sessionStateSchema, createSessionDB, ... } from '@electric-sql/durable-session'
import type { SessionDB, MessageRow, ModelMessage } from '@electric-sql/durable-session'

// AFTER:
import { sessionStateSchema, createSessionDB, ... } from '@superset/durable-session'
import type { SessionDB, MessageRow, ModelMessage } from '@superset/durable-session'
```

**Replace** existing `apps/streams/src/index.ts` and **delete** `session-registry.ts`.

#### New entrypoint: `apps/streams/src/index.ts`

Based on vendored `dev.ts` pattern, combined with existing DurableStreamTestServer. All env vars are validated via `env.ts` (required, no defaults).

```typescript
import { DurableStreamTestServer } from '@durable-streams/server'
import { serve } from '@hono/node-server'
import { claudeAgentApp } from './claude-agent'
import { env } from './env'
import { createServer } from './server'

const durableStreamServer = new DurableStreamTestServer({
  port: env.STREAMS_INTERNAL_PORT,
  dataDir: env.STREAMS_DATA_DIR,
})
await durableStreamServer.start()

const { app } = createServer({
  baseUrl: env.STREAMS_INTERNAL_URL,
  cors: true,
  logging: true,
  authToken: env.STREAMS_SECRET,
})

serve({ fetch: app.fetch, port: env.PORT })
serve({ fetch: claudeAgentApp.fetch, port: env.STREAMS_AGENT_PORT })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    /* graceful shutdown */
  })
}
```

#### Key Protocol Internals (`protocol.ts`, ~917 lines)

The `AIDBSessionProtocol` class manages:

1. **Session lifecycle**: `createSession()` → creates DurableStream + SessionDB + reactive trigger
2. **Chunk writing** via `sessionStateSchema.chunks.insert({ key, value })`:
   - User messages: single chunk with `{ type: 'whole-message', message: UIMessage }`
   - Agent responses: sequential chunks with TanStack AI StreamChunk objects
3. **Reactive agent triggering**: After `preload()`, subscribes to `modelMessages.subscribeChanges()` — only triggers for NEW user messages (not historical)
4. **Agent invocation**: `fetch()` to agent endpoint → parse SSE → `writeChunk()` for each data line
5. **Active generation tracking**: Map<messageId, AbortController> for interrupt support
6. **Stop generation**: `abortController.abort()` → writes `{ type: 'stop', reason: 'aborted' }` chunk
7. **Message history**: Reads from materialized `modelMessages` collection (not raw chunks)

**Add to `apps/streams/package.json`:**
```json
{
  "dependencies": {
    "@durable-streams/server": "^0.2.0",
    "@durable-streams/client": "^0.2.0",
    "@hono/node-server": "^1.13.0",
    "@superset/durable-session": "workspace:*",
    "@tanstack/db": "^0.5.22",
    "hono": "^4.4.0",
    "zod": "^4.1.12"
  }
}
```

---

## Phase B: Claude Agent Endpoint

### B1. Create `apps/streams/src/claude-agent.ts`

Hono app that acts as an AI agent endpoint the proxy can invoke. The proxy's `invokeAgent()` calls this endpoint via `fetch()` and parses the SSE response.

```typescript
import { Hono } from 'hono'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { convertSDKMessageToSSE } from './sdk-to-ai-chunks'

const app = new Hono()

// Session state for multi-turn resume
const claudeSessions = new Map<string, string>() // sessionId → claudeSessionId

app.post('/', async (c) => {
  const { messages, stream: shouldStream, sessionId } = await c.req.json()

  // Extract prompt from latest user message
  const latestUserMessage = messages.filter(m => m.role === 'user').pop()
  if (!latestUserMessage) {
    return c.json({ error: 'No user message found' }, 400)
  }

  const prompt = latestUserMessage.content
  const claudeSessionId = claudeSessions.get(sessionId)

  // Run Claude query
  const result = query({
    prompt,
    options: {
      ...(claudeSessionId && { resume: claudeSessionId }),
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 25,
    },
    abortSignal: c.req.raw.signal,
  })

  // Return SSE response
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const message of result) {
          // Extract claudeSessionId from system init
          if (message.type === 'system' && message.subtype === 'init') {
            claudeSessions.set(sessionId, message.session_id)
            continue
          }

          // Convert SDKMessage → TanStack AI SSE chunks
          const chunks = convertSDKMessageToSSE(message)
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

export { app as claudeAgentApp }
```

**Integration with proxy:** Register this agent endpoint in the proxy:
```typescript
// In session startup:
await protocol.registerAgent(sessionId, {
  id: 'claude',
  name: 'Claude Agent',
  endpoint: `http://localhost:${CLAUDE_AGENT_PORT}/`,
  method: 'POST',
  triggers: 'user-messages',
  bodyTemplate: { sessionId },
})
```

**Session state:** Maintains `Map<sessionId, claudeSessionId>` for multi-turn resume.

**Abort handling:** When proxy calls `stopGeneration()`, it aborts the fetch to this endpoint. The agent detects the abort via `c.req.raw.signal` and the `query()` call is interrupted.

### B2. Create `apps/streams/src/sdk-to-ai-chunks.ts`

Pure conversion module. Maps Claude SDK `SDKMessage` types to TanStack AI `StreamChunk`.

**The proxy expects standard JSON chunks** — it reads SSE `data: {...}` lines, parses JSON, and writes each chunk to the durable stream via `protocol.writeChunk()`. The `StreamProcessor` on the client side then materializes these into `MessagePart[]`.

#### Conversion Table

| SDKMessage | TanStack AI Chunk | Notes |
|---|---|---|
| `stream_event` → `content_block_start` (text) | — | No chunk, wait for deltas |
| `stream_event` → `content_block_delta` (text_delta) | `{ type: "text-delta", textDelta }` | |
| `stream_event` → `content_block_start` (tool_use) | `{ type: "tool-call-streaming-start", toolCallId, toolName }` | |
| `stream_event` → `content_block_delta` (input_json_delta) | `{ type: "tool-call-delta", toolCallId, argsTextDelta }` | |
| `stream_event` → `content_block_stop` (tool_use) | `{ type: "tool-call", toolCallId, toolName, args }` | Full args from accumulator |
| `stream_event` → `content_block_start` (thinking) | — | Wait for deltas |
| `stream_event` → `content_block_delta` (thinking_delta) | `{ type: "reasoning", textDelta }` | |
| `user` (tool_result blocks) | `{ type: "tool-result", toolCallId, result }` | Server-side tool execution |
| `result` | `{ type: "done", finishReason: "stop" }` | End of agent turn, maps to `DoneStreamChunk` |
| `system` (init) | — | Extract `claudeSessionId` internally |
| `assistant` | — | Skip (stream_events already cover content) |

#### Implementation Skeleton

```typescript
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

interface ConversionState {
  // Map content_block index → block type + metadata
  activeBlocks: Map<number, {
    type: 'text' | 'tool_use' | 'thinking'
    toolCallId?: string
    toolName?: string
    argsAccumulator?: string  // JSON string accumulator for tool_use
  }>
}

export function createConverter(): {
  state: ConversionState
  convert: (message: SDKMessage) => StreamChunk[]
} {
  const state: ConversionState = { activeBlocks: new Map() }

  return {
    state,
    convert(message: SDKMessage): StreamChunk[] {
      if (message.type === 'stream_event') {
        return handleStreamEvent(state, message.event)
      }
      if (message.type === 'user') {
        // tool_result from Claude's internal tool execution
        return message.message.content
          .filter(block => block.type === 'tool_result')
          .map(block => ({
            type: 'tool-result' as const,
            toolCallId: block.tool_use_id,
            result: block.content,
          }))
      }
      if (message.type === 'result') {
        return [{ type: 'done' as const, finishReason: 'stop' }]
      }
      return [] // Skip system, assistant
    },
  }
}

// Simpler stateless wrapper
export function convertSDKMessageToSSE(message: SDKMessage): StreamChunk[] {
  // ... delegates to converter
}
```

**ConversionState** tracks:
- Active content block indices (to correlate starts with deltas)
- JSON accumulator per tool_use block (for partial → full args on `content_block_stop`)
- Current tool call IDs per block index

**Key TanStack AI StreamChunk types** (from `@tanstack/ai`):
```typescript
type StreamChunk =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call-streaming-start'; toolCallId: string; toolName: string }
  | { type: 'tool-call-delta'; toolCallId: string; argsTextDelta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; result: unknown }
  | { type: 'reasoning'; textDelta: string }
  | { type: 'done'; finishReason: string }
```

---

## Phase C: Update Client Packages

### C1. ~~Update `packages/ai-chat`~~ — DONE

`packages/ai-chat` has been fully removed. All stream client code, hooks, materialization, and UI components are now in `packages/durable-session`. Consumers import directly:

```typescript
// Data layer
import { DurableChatClient, createDurableChatClient } from '@superset/durable-session'

// React hooks + components
import { useDurableChat, ChatInput, PresenceBar } from '@superset/durable-session/react'
```

### C2. Simplify desktop session manager

**Rewrite** `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts`:

**Remove entirely:**
- `StreamWatcher` class (watched stream for user_input via SSE — proxy now handles this reactively)
- `IdempotentProducer` / `createProducer` / `closeProducer` (proxy writes to durable stream)
- `processUserMessage()` (moved to Claude agent endpoint)
- `binaryPathResolver` (moved to agent endpoint env)

**New session manager** — thin HTTP orchestrator:

```typescript
const PROXY_URL = process.env.STREAMS_URL || 'http://localhost:8080'

export class ClaudeSessionManager extends EventEmitter {
  private activeSessions = new Map<string, { sessionId: string }>()

  async startSession({ sessionId, cwd, env }: StartSessionOptions): Promise<void> {
    // 1. Create session on proxy
    await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, { method: 'PUT' })

    // 2. Register Claude agent
    await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents: [{
          id: 'claude',
          name: 'Claude Agent',
          endpoint: `http://localhost:${CLAUDE_AGENT_PORT}/`,
          triggers: 'user-messages',
          bodyTemplate: { sessionId, cwd, env },
        }],
      }),
    })

    this.activeSessions.set(sessionId, { sessionId })
    this.emit('session:started', { sessionId })
  }

  async stopSession(sessionId: string): Promise<void> {
    // 1. Stop active generations
    await this.interrupt(sessionId)
    // 2. Unregister agent
    await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/agents/claude`, { method: 'DELETE' })
    // 3. Delete session
    await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, { method: 'DELETE' })

    this.activeSessions.delete(sessionId)
    this.emit('session:stopped', { sessionId })
  }

  async interrupt(sessionId: string): Promise<void> {
    await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    this.emit('session:interrupted', { sessionId })
  }

  isActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }

  getActiveSessions(): string[] {
    return [...this.activeSessions.keys()]
  }
}
```

**tRPC router** (`apps/desktop/src/lib/trpc/routers/ai-chat/index.ts`) keeps same shape — just the session manager internals are simpler.

### C3. Handle drafts

Official schema has `agents` instead of `drafts`. Typing indicators come from presence `status` field.

- Draft content → local React state / Zustand
- Typing indicator → presence `status: 'typing'` (can extend presence schema)

---

## Phase D: Database Schema

**`packages/db/src/schema/chat.ts`** (new):
```typescript
export const chatSessions = pgTable("chat_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").references(() => repositories.id),
  workspaceId: text("workspace_id"),
  title: text().notNull(),
  claudeSessionId: text("claude_session_id"),
  cwd: text(),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  role: text().notNull(),
  content: text().notNull(),
  toolCalls: jsonb("tool_calls"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdById: uuid("created_by_id").references(() => users.id),
  processingStartedAt: timestamp("processing_started_at"),
  processingExpiresAt: timestamp("processing_expires_at"),
  processedAt: timestamp("processed_at"),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatParticipants = pgTable("chat_participants", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text().notNull().default("viewer"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});
```

---

## Phase E: API tRPC Router

**`packages/trpc/src/router/chat/index.ts`**:
- `createSession`, `sendMessage`, `listSessions`, `getSession`, `getMessages`
- `saveAssistantMessage` (called by desktop on completion)
- `archiveSession`

---

## Phase F: Desktop Chat UI ✅ DONE

Chat pane integrated as a tab type in the desktop workspace view. The UI connects to the durable session proxy via `useDurableChat` and manages session lifecycle through the existing `ai-chat` tRPC router.

```
apps/desktop/src/renderer/.../ChatPane/
├── ChatPane.tsx                    -- Threads sessionId + cwd from pane store/workspace
├── ChatInterface/
│   ├── ChatInterface.tsx           -- Core: useDurableChat + tRPC session lifecycle
│   ├── constants.ts                -- MODELS, SUGGESTIONS
│   ├── types.ts                    -- ModelOption
│   ├── utils/
│   │   └── map-tool-state.ts       -- Maps TanStack AI ToolCallPart states → ToolDisplayState
│   └── components/
│       ├── ChatMessageItem/        -- Renders UIMessage.parts[] (text, thinking, tool-call)
│       ├── ToolCallBlock/          -- ToolCallPart + ToolResultPart → Tool + Confirmation UI
│       ├── ModelPicker/
│       ├── ContextIndicator/
│       └── PlanBlock/
```

### Session lifecycle

1. `ChatPane` reads `sessionId` from pane store (generated by `createChatPane()`) and `cwd` from workspace query
2. `ChatInterface` mounts → tRPC `startSession.mutate()` → main process → HTTP PUT to proxy
3. tRPC `onSuccess` → `useDurableChat.connect()` opens SSE stream from proxy
4. User sends message → `sendMessage()` → proxy → Claude agent → streamed chunks → reactive UI
5. Unmount → tRPC `stopSession.mutate()` cleans up

### Type bridge: TanStack AI → UI components

`packages/ui` AI element components define a local `ToolDisplayState` type that covers both TanStack AI states (`awaiting-input`, `input-complete`, `approval-requested`, `approval-responded`) and UI-only states (`input-available`, `output-available`, `output-error`, `output-denied`). The `mapToolCallState()` utility in the desktop app bridges `ToolCallPart.state` → `ToolDisplayState`.

### Environment variables

| Variable | Description |
|----------|-------------|
| `STREAMS_URL` | Proxy URL exposed via tRPC `getConfig` query |
| `STREAMS_SECRET` | Bearer token for authenticated proxy |

---

## Phase G: Web Chat UI

```
apps/web/src/app/(dashboard)/chat/
├── page.tsx
├── [sessionId]/
│   └── page.tsx
└── components/
    ├── ChatMessageList.tsx
    ├── ChatMessage.tsx
    ├── ChatInput.tsx
    ├── PresenceBar.tsx
    └── TypingIndicator.tsx
```

Web uses same `useDurableChat` hook pointing at deployed proxy URL.

---

## Dependencies

**New packages needed** (all published on npm):

| Package | Version | Used By |
|---------|---------|---------|
| `@tanstack/ai` | ^0.3.0 | durable-session (StreamProcessor for materialization) |
| `@tanstack/db-ivm` | ^0.1.17 | durable-session (incremental view maintenance) |
| `@standard-schema/spec` | ^1.0.0 | durable-session (schema validation) |
| `hono` | ^4.4.0 | apps/streams (proxy HTTP framework) |
| `@hono/node-server` | ^1.13.0 | apps/streams (Hono Node.js HTTP adapter) |

**Already installed:**
- `@durable-streams/client` ^0.2.0, `@durable-streams/server` ^0.2.0, `@durable-streams/state` ^0.2.0
- `@tanstack/db` 0.5.22, `@tanstack/react-db` 0.1.66
- `@anthropic-ai/claude-agent-sdk` ^0.2.19
- `zod` ^4.3.5

## Environment Variables

All env vars are required — the streams server throws at startup if any are missing.

```bash
# Streams server (apps/streams)
PORT=8080                                          # Proxy port (set by Fly.io in production)
STREAMS_INTERNAL_PORT=8081                         # Internal durable stream server port
STREAMS_AGENT_PORT=9090                            # Claude agent endpoint port
STREAMS_INTERNAL_URL=http://127.0.0.1:8081         # Internal durable stream server URL
STREAMS_DATA_DIR=/data                             # Data directory for LMDB + session persistence
STREAMS_SECRET=<random-64-char-token>              # Bearer token for /v1/* route auth
ANTHROPIC_API_KEY=sk-ant-...                       # Claude API key

# Desktop (apps/desktop) — validated in env.main.ts, required
STREAMS_URL=http://localhost:8080                  # Proxy URL exposed via tRPC getConfig
STREAMS_SECRET=<same-token>                        # Bearer token for authenticated proxy
```

---

## Complete File Operations Summary

### Files CREATED (vendored client — Phase A1) ✅

All files below are created and typechecking. Compatibility fixes applied for unreleased `@tanstack/db` aggregates (`collect`, `minStr`) and `@tanstack/ai` types (`DoneStreamChunk`).

| Destination | Source | Status |
|---|---|---|
| `packages/durable-session/package.json` | NEW | ✅ |
| `packages/durable-session/tsconfig.json` | NEW | ✅ |
| `packages/durable-session/src/index.ts` | `durable-session/src/index.ts` | ✅ |
| `packages/durable-session/src/client.ts` | `durable-session/src/client.ts` | ✅ (fixed) |
| `packages/durable-session/src/collection.ts` | `durable-session/src/collection.ts` | ✅ |
| `packages/durable-session/src/materialize.ts` | `durable-session/src/materialize.ts` | ✅ (fixed) |
| `packages/durable-session/src/schema.ts` | `durable-session/src/schema.ts` | ✅ |
| `packages/durable-session/src/types.ts` | `durable-session/src/types.ts` | ✅ (fixed) |
| `packages/durable-session/src/collections/index.ts` | `durable-session/src/collections/index.ts` | ✅ |
| `packages/durable-session/src/collections/messages.ts` | `durable-session/src/collections/messages.ts` | ✅ (rewritten) |
| `packages/durable-session/src/collections/active-generations.ts` | `durable-session/src/collections/active-generations.ts` | ✅ |
| `packages/durable-session/src/collections/session-meta.ts` | `durable-session/src/collections/session-meta.ts` | ✅ |
| `packages/durable-session/src/collections/session-stats.ts` | `durable-session/src/collections/session-stats.ts` | ✅ (rewritten) |
| `packages/durable-session/src/collections/model-messages.ts` | `durable-session/src/collections/model-messages.ts` | ✅ |
| `packages/durable-session/src/collections/presence.ts` | `durable-session/src/collections/presence.ts` | ✅ (rewritten) |
| `packages/durable-session/src/react/index.ts` | `react-durable-session/src/index.ts` | ✅ |
| `packages/durable-session/src/react/types.ts` | `react-durable-session/src/types.ts` | ✅ |
| `packages/durable-session/src/react/use-durable-chat.ts` | `react-durable-session/src/use-durable-chat.ts` | ✅ |
| `packages/durable-session/src/react/components/ChatInput/` | Migrated from `packages/ai-chat` | ✅ |
| `packages/durable-session/src/react/components/PresenceBar/` | Migrated from `packages/ai-chat` | ✅ |

### Files CREATED (Phase B — Claude Agent Endpoint) ✅

| File | Description | Status |
|---|---|---|
| `apps/streams/src/claude-agent.ts` | Claude agent HTTP endpoint (Hono, SSE response) | ✅ |
| `apps/streams/src/sdk-to-ai-chunks.ts` | SDKMessage → TanStack AI AG-UI chunk converter | ✅ |

### Files CREATED (vendored proxy — Phase A2) ✅

All files below are created and typechecking. Compatibility fix: `DurableStream.append()` in published `@durable-streams/client@0.2.1` only accepts `string | Uint8Array`, not `ChangeEvent` objects. All `stream.append(event)` calls wrapped with `JSON.stringify()`.

| Destination | Source | Status |
|---|---|---|
| `apps/streams/src/server.ts` | `durable-session-proxy/src/server.ts` | ✅ |
| `apps/streams/src/protocol.ts` | `durable-session-proxy/src/protocol.ts` | ✅ (fixed: JSON.stringify for append) |
| `apps/streams/src/types.ts` | `durable-session-proxy/src/types.ts` | ✅ |
| `apps/streams/src/handlers/index.ts` | `durable-session-proxy/src/handlers/index.ts` | ✅ |
| `apps/streams/src/handlers/send-message.ts` | `durable-session-proxy/src/handlers/send-message.ts` | ✅ |
| `apps/streams/src/handlers/invoke-agent.ts` | `durable-session-proxy/src/handlers/invoke-agent.ts` | ✅ |
| `apps/streams/src/handlers/stream-writer.ts` | `durable-session-proxy/src/handlers/stream-writer.ts` | ✅ |
| `apps/streams/src/routes/index.ts` | `durable-session-proxy/src/routes/index.ts` | ✅ |
| `apps/streams/src/routes/sessions.ts` | `durable-session-proxy/src/routes/sessions.ts` | ✅ |
| `apps/streams/src/routes/messages.ts` | `durable-session-proxy/src/routes/messages.ts` | ✅ |
| `apps/streams/src/routes/agents.ts` | `durable-session-proxy/src/routes/agents.ts` | ✅ |
| `apps/streams/src/routes/stream.ts` | `durable-session-proxy/src/routes/stream.ts` | ✅ |
| `apps/streams/src/routes/tool-results.ts` | `durable-session-proxy/src/routes/tool-results.ts` | ✅ |
| `apps/streams/src/routes/approvals.ts` | `durable-session-proxy/src/routes/approvals.ts` | ✅ |
| `apps/streams/src/routes/health.ts` | `durable-session-proxy/src/routes/health.ts` | ✅ |
| `apps/streams/src/routes/auth.ts` | `durable-session-proxy/src/routes/auth.ts` | ✅ |
| `apps/streams/src/routes/fork.ts` | `durable-session-proxy/src/routes/fork.ts` | ✅ |

### Files DELETED ✅

| File | Reason | Status |
|---|---|---|
| `packages/ai-chat/` (entire package) | Replaced by `@superset/durable-session` | ✅ Removed |

### Files DELETED (Phase A2) ✅

| File | Reason | Status |
|---|---|---|
| `apps/streams/src/session-registry.ts` | Replaced by proxy's built-in session management | ✅ Removed |

### Files REWRITTEN (Phase A2) ✅

| File | Description | Status |
|---|---|---|
| `apps/streams/src/index.ts` | New entrypoint with Hono proxy + DurableStreamTestServer | ✅ |

### Files REWRITTEN (Phase C2) ✅

| File | Description | Status |
|---|---|---|
| `apps/desktop/.../session-manager.ts` | Thin HTTP orchestrator (no StreamWatcher/Producer) | ✅ |

### Files MODIFIED (Phase A2) ✅

| File | Changes | Status |
|---|---|---|
| `apps/streams/package.json` | Added: hono, @hono/node-server, @durable-streams/client, @superset/durable-session, @tanstack/db, zod | ✅ |
| `packages/durable-session/src/client.ts` | Fixed: `response.json()` return type assertion for `ForkResult` | ✅ |

### Files MODIFIED (Phase B) ✅

| File | Changes | Status |
|---|---|---|
| `apps/streams/package.json` | Added: @anthropic-ai/claude-agent-sdk, @tanstack/ai | ✅ |
| `apps/streams/src/index.ts` | Added: Claude agent endpoint on STREAMS_AGENT_PORT | ✅ |

---

## Implementation Order

1. ~~**Phase A1** — Vendor `@superset/durable-session` package~~ ✅ DONE
2. ~~**Phase C1** — Remove old `packages/ai-chat`, migrate UI components~~ ✅ DONE
3. ~~**Phase A2** — Vendor proxy into `apps/streams` (copy 17 files, adjust 3 import paths)~~ ✅ DONE
4. ~~**Phase B** — Claude agent endpoint + SDK-to-AI chunk converter (2 new files)~~ ✅ DONE
5. ~~**Phase C2** — Simplify desktop session manager~~ ✅ DONE
6. ~~**Phase F** — Desktop chat UI (works with existing proxy, no DB needed)~~ ✅ DONE
7. **Phase C3** — Handle drafts (local state + typing indicators)
8. **Phase G** — Web chat UI
9. **Phase D** — Database schema + migration (persistent storage)
10. **Phase E** — API tRPC router (web session management)

---

## Risks

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| `@tanstack/ai` API mismatch with vendored code | Build breaks | Vendored code uses `workspace:*` — pin to compatible published versions, fix API differences | ✅ Resolved — `DoneStreamChunk` → `RUN_FINISHED`, `LiveMode` removed |
| `@tanstack/db` unreleased aggregates | Build breaks | Rewrite collection pipelines with `groupBy + count + fn.select` workaround | ✅ Resolved — `collect`/`minStr` replaced |
| SDKMessage → AI chunk conversion errors | Broken rendering | Comprehensive unit tests with real Claude output fixtures | Pending (Phase B) |
| Dual `StreamChunk` types | Type confusion, silent mismatches at module boundaries | `sdk-to-ai-chunks.ts` imports strict `StreamChunk` from `@tanstack/ai` (union of 14 AG-UI events). `types.ts` defines a loose `{ type: string; [key: string]: unknown }` used by `protocol.ts` and `stream-writer.ts`. Works at runtime because JSON serialization is the boundary, but `protocol.ts` gets zero type safety when constructing/consuming chunks. **Fix:** delete local `StreamChunk` from `types.ts`, use `@tanstack/ai`'s everywhere, replace `as StreamChunk` casts in `protocol.ts` with typed construction (~10 call sites). | Deferred — cleanup PR |
| Claude binary path outside Electron | Agent can't start | Claude agent SDK resolves binary automatically | ✅ Resolved — CLAUDE_BINARY_PATH removed |
| Multi-turn resume state lost on restart | Context lost | In-memory map + optional file-based persistence in data dir | Pending |
| Interrupt via HTTP abort | Claude subprocess continues | Agent detects fetch abort → calls `query.interrupt()` + `abortController.abort()` | Pending |
| Proxy `workspace:*` TanStack DB deps | Import errors | Pin all `@tanstack/*` to compatible published versions across monorepo | ✅ Resolved — imports changed to `@superset/durable-session`, `DurableStream.append()` wrapped with `JSON.stringify()` |

---

## API Quick Reference

### `useDurableChat(options)` Return Type

```typescript
interface UseDurableChatReturn {
  // TanStack AI useChat-compatible
  messages: UIMessage[]                     // All messages (reactive)
  sendMessage: (content: string) => Promise<void>
  append: (message: UIMessage | { role: string; content: string }) => Promise<void>
  reload: () => Promise<void>              // Regenerate last response
  stop: () => void                         // Stop active generations
  clear: () => void                        // Clear local messages
  isLoading: boolean                       // Any generation active?
  error: Error | undefined
  addToolResult: (result: ToolResultInput) => Promise<void>
  addToolApprovalResponse: (response: ApprovalResponseInput) => Promise<void>

  // Durable extensions
  client: DurableChatClient                // Underlying client instance
  collections: DurableChatCollections      // All reactive collections
  connectionStatus: ConnectionStatus       // 'disconnected' | 'connecting' | 'connected' | 'error'
  fork: (options?: ForkOptions) => Promise<ForkResult>
  registerAgents: (agents: AgentSpec[]) => Promise<void>
  unregisterAgent: (agentId: string) => Promise<void>
  connect: () => Promise<void>
  disconnect: () => void
  pause: () => void
  resume: () => Promise<void>
}
```

### `DurableChatCollections`

```typescript
interface DurableChatCollections {
  chunks: Collection<ChunkRow>              // Root — synced from stream
  presence: Collection<PresenceRow>         // Aggregated per-actor presence
  agents: Collection<AgentRow>              // Registered webhook agents
  messages: Collection<MessageRow>          // Materialized messages
  toolCalls: Collection<MessageRow>         // Messages with tool-call parts
  pendingApprovals: Collection<MessageRow>  // Messages with unapproved tool calls
  toolResults: Collection<MessageRow>       // Messages with tool-result parts
  activeGenerations: Collection<ActiveGenerationRow>  // Incomplete messages
  sessionMeta: Collection<SessionMetaRow>   // Local connection state
  sessionStats: Collection<SessionStatsRow> // Aggregate statistics
}
```

### `MessageRow` (from materialized messages)

```typescript
interface MessageRow {
  id: string                  // messageId
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]        // TanStack AI parts (TextPart, ToolCallPart, etc.)
  actorId: string
  isComplete: boolean         // Has finish/done chunk been received?
  createdAt: Date
}
```

### Proxy HTTP API

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `PUT` | `/v1/sessions/:id` | — | `{ sessionId, streamUrl }` |
| `GET` | `/v1/sessions/:id` | — | `{ sessionId, streamUrl }` |
| `DELETE` | `/v1/sessions/:id` | — | 204 |
| `POST` | `/v1/sessions/:id/messages` | `{ content, actorId?, agent? }` | `{ messageId }` |
| `POST` | `/v1/sessions/:id/stop` | `{ messageId? }` | 204 |
| `POST` | `/v1/sessions/:id/regenerate` | `{ fromMessageId, content }` | `{ success }` |
| `POST` | `/v1/sessions/:id/reset` | `{ clearPresence? }` | `{ success }` |
| `POST` | `/v1/sessions/:id/agents` | `{ agents: AgentSpec[] }` | `{ success }` |
| `GET` | `/v1/sessions/:id/agents` | — | `{ agents }` |
| `DELETE` | `/v1/sessions/:id/agents/:agentId` | — | 204 |
| `POST` | `/v1/sessions/:id/tool-results` | `{ toolCallId, output, error? }` | 204 |
| `POST` | `/v1/sessions/:id/approvals/:id` | `{ approved }` | 204 |
| `POST` | `/v1/sessions/:id/fork` | `{ atMessageId?, newSessionId? }` | `{ sessionId, offset }` |
| `POST` | `/v1/sessions/:id/login` | `{ actorId, deviceId, name? }` | `{ success }` |
| `POST` | `/v1/sessions/:id/logout` | `{ actorId, deviceId }` | `{ success }` |
| `GET` | `/v1/stream/sessions/:id` | — | SSE stream (proxied to durable stream) |
| `GET` | `/health` | — | `{ status: 'ok' }` |

---

## Testing Patterns

The vendored source includes test helpers at `packages/durable-session/tests/fixtures/test-helpers.ts`. Key patterns:

### Mock SessionDB for Unit Tests

```typescript
import { createMockSessionDB } from '@superset/durable-session/test-helpers'

// Create mock with controllable collections
const { sessionDB, controllers } = createMockSessionDB('test-session')

const client = new DurableChatClient({
  sessionId: 'test-session',
  proxyUrl: 'http://localhost:4000',
  sessionDB, // Inject mock — skips real stream connection
})

await client.connect()

// Emit test chunks via controller
controllers.chunks.emit([{
  id: 'msg-1:0',
  messageId: 'msg-1',
  actorId: 'user-1',
  role: 'user',
  chunk: JSON.stringify({
    type: 'whole-message',
    message: { id: 'msg-1', role: 'user', parts: [{ type: 'text', content: 'Hello' }] }
  }),
  seq: 0,
  createdAt: new Date().toISOString(),
}])
controllers.chunks.markReady()

// Wait for live query pipeline
await new Promise(r => setTimeout(r, 40))

// Assert materialized messages
const messages = [...client.collections.messages.values()]
expect(messages).toHaveLength(1)
expect(messages[0].role).toBe('user')
```

### SDK-to-AI Chunk Conversion Tests

Test with captured SDKMessage fixtures to verify the conversion:
```typescript
import { convertSDKMessageToSSE } from './sdk-to-ai-chunks'

it('converts text_delta to text-delta chunk', () => {
  const sdkMessage = {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    },
  }
  const chunks = convertSDKMessageToSSE(sdkMessage)
  expect(chunks).toEqual([{ type: 'text-delta', textDelta: 'Hello' }])
})

it('converts result to done chunk', () => {
  const sdkMessage = { type: 'result', result: { stop_reason: 'end_turn' } }
  const chunks = convertSDKMessageToSSE(sdkMessage)
  expect(chunks).toEqual([{ type: 'done', finishReason: 'stop' }])
})
```

---

## Verification

### Phase A1 Verification (Vendored Package) ✅ PASSED
```bash
# 1. Install deps
cd packages/durable-session && bun install
# 2. Type check vendored package — 0 errors, 0 warnings
bunx tsc --noEmit
# 3. Lint — 0 errors, 0 warnings
bun run lint:fix
```

### Phase A2 + B Verification (Proxy + Agent)
```bash
# 1. Start streams server
cd apps/streams && bun dev

# 2. Health check
curl http://localhost:8080/health
# → { "status": "ok", "timestamp": "..." }

# 3. Create session
curl -X PUT http://localhost:8080/v1/sessions/test-1
# → { "sessionId": "test-1", "streamUrl": "/v1/stream/sessions/test-1" }

# 4. Register Claude agent
curl -X POST http://localhost:8080/v1/sessions/test-1/agents \
  -H 'Content-Type: application/json' \
  -d '{"agents":[{"id":"claude","endpoint":"http://localhost:9090/","triggers":"user-messages"}]}'

# 5. Send message (triggers agent)
curl -X POST http://localhost:8080/v1/sessions/test-1/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hello","actorId":"user-1"}'
# → { "messageId": "..." }

# 6. Read stream (verify chunks)
curl http://localhost:8080/v1/stream/sessions/test-1
# → SSE events with chunk data

# 7. Stop generation
curl -X POST http://localhost:8080/v1/sessions/test-1/stop \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### Phase C Verification (Client Integration)
1. `useDurableChat({ sessionId: "test-1", proxyUrl: "http://localhost:8080" })` → messages render
2. Interrupt: POST `/v1/sessions/test-1/stop` → generation halts, `isLoading` becomes `false`
3. Reconnection: reload page → messages replayed from stream offset (not re-fetched)
4. Multi-client: open 2 tabs → both see same messages in real-time via SSE sync
5. Presence: both tabs show in `collections.presence`
