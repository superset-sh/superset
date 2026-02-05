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

1. **Vendor `@electric-sql/durable-session`** — Not published to npm. Vendored from [electric-sql/transport](https://github.com/electric-sql/transport) (~35 files, ~4500 LOC). Gives us reactive collections, optimistic mutations, TanStack AI compatibility.
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
| Durable stream server (v1) | DONE — `apps/streams/` (custom HTTP proxy + session registry) |
| Stream client (v1) | DONE — `packages/ai-chat/src/stream/client.ts` (custom DurableChatClient) |
| Stream hook (v1) | DONE — `packages/ai-chat/src/stream/useChatSession.ts` (custom hook) |
| Custom materialization (v1) | DONE — `packages/ai-chat/src/stream/materialize.ts` |
| ChatInput component | DONE — `packages/ai-chat/src/components/ChatInput/` |
| PresenceBar component | DONE — `packages/ai-chat/src/components/PresenceBar/` |
| Database schema | NOT BUILT |
| API chat router | NOT BUILT |
| Desktop chat UI (renderer) | NOT BUILT |
| Web chat UI | NOT BUILT |
| Message rendering component | NOT BUILT |
| Vendored durable-session | NOT BUILT — **Next phase** |

---

## Phase A: Vendor `@electric-sql/durable-session` ← NEXT

Source: [electric-sql/transport](https://github.com/electric-sql/transport) (unpublished, Apache-2.0)

### A1. Create `packages/durable-session/`

Vendor from `packages/durable-session` + `packages/react-durable-session` in the transport repo.

```
packages/durable-session/
  package.json
  tsconfig.json
  src/
    index.ts                  -- Re-exports everything
    client.ts                 -- DurableChatClient class (~830 lines)
    collection.ts             -- createSessionDB factory
    materialize.ts            -- materializeMessage (uses @tanstack/ai StreamProcessor)
    schema.ts                 -- sessionStateSchema (chunks, presence, agents)
    types.ts                  -- All TypeScript types (~420 lines)
    collections/
      index.ts
      messages.ts             -- createMessagesCollection + derived (toolCalls, pendingApprovals, toolResults)
      active-generations.ts   -- createActiveGenerationsCollection
      session-meta.ts         -- createSessionMetaCollectionOptions (local-only)
      session-stats.ts        -- createSessionStatsCollection
      model-messages.ts       -- createModelMessagesCollection (LLM-ready format)
      presence.ts             -- createPresenceCollection (aggregated by actorId)
    react/
      index.ts
      types.ts                -- UseDurableChatOptions, UseDurableChatReturn
      use-durable-chat.ts     -- useDurableChat hook (~340 lines)
```

**Dependencies** (all published on npm):
```json
{
  "name": "@superset/durable-session",
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

**Key adaptations when vendoring:**
- Replace all `workspace:*` with published versions
- Replace `@electric-sql/durable-session` imports in react files with relative `../` imports
- Package name becomes `@superset/durable-session`

**Schema** (from official `schema.ts`):
```typescript
// Chunks: structured, not raw passthrough
const chunkValueSchema = z.object({
  messageId: z.string(),
  actorId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  chunk: z.string(),     // JSON-serialized TanStack AI StreamChunk
  seq: z.number(),
  createdAt: z.string(),
})

// Presence: richer than our current schema
const presenceValueSchema = z.object({
  actorId: z.string(),
  deviceId: z.string(),
  actorType: z.enum(['user', 'agent']),
  name: z.string().optional(),
  status: z.enum(['online', 'offline', 'away']),
  lastSeenAt: z.string(),
})

// Agents: new collection (replaces our drafts)
const agentValueSchema = z.object({
  agentId: z.string(),
  name: z.string().optional(),
  endpoint: z.string(),
  triggers: z.enum(['all', 'user-messages']).optional(),
})
```

**Materialization pipeline** (from official `materialize.ts`):
- User messages stored as "whole-message" chunks → returned as-is
- Assistant messages stored as sequential StreamChunk JSON strings → accumulated via `StreamProcessor` from `@tanstack/ai`
- `createMessagesCollection()` groups chunks by `messageId`, orders by `startedAt`, materializes via `fn.select()`
- Derived collections (toolCalls, pendingApprovals, etc.) are reactive filters on the messages collection

### A2. Vendor proxy into `apps/streams/`

Vendor from `packages/durable-session-proxy` in the transport repo.

```
apps/streams/src/
  index.ts               -- Server entrypoint (starts proxy + internal durable stream)
  server.ts              -- createServer() factory (vendored)
  protocol.ts            -- AIDBSessionProtocol (~917 lines, vendored)
  types.ts               -- Request/response types + Zod schemas (vendored)
  handlers/
    index.ts
    send-message.ts      -- handleSendMessage
    invoke-agent.ts      -- handleInvokeAgent, handleRegisterAgents
    stream-writer.ts     -- StreamWriter class
  routes/
    index.ts
    sessions.ts          -- PUT/GET/DELETE sessions
    messages.ts          -- POST messages, regenerate, stop
    agents.ts            -- POST/GET/DELETE agents
    stream.ts            -- SSE proxy to underlying durable stream
    tool-results.ts
    approvals.ts
    health.ts
    auth.ts              -- login/logout (presence)
```

**Replace** existing `apps/streams/src/index.ts` and **delete** `session-registry.ts`.

**Add to `apps/streams/package.json`:**
```json
{
  "dependencies": {
    "@durable-streams/server": "^0.2.0",
    "@durable-streams/client": "^0.2.0",
    "@superset/durable-session": "workspace:*",
    "@tanstack/db": "^0.5.22",
    "hono": "^4.4.0",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@hono/node-server": "^1.13.0"
  }
}
```

---

## Phase B: Claude Agent Endpoint

### B1. Create `apps/streams/src/claude-agent.ts`

HTTP endpoint the proxy invokes when a user sends a message:

```typescript
// Hono app with POST /
// 1. Receives { messages: Array<{ role, content, parts }> } from proxy
// 2. Extracts latest user message as prompt
// 3. Runs query() from @anthropic-ai/claude-agent-sdk
// 4. Converts SDKMessage stream → TanStack AI SSE chunks
// 5. Returns SSE Response
```

**Session state:** Maintains `Map<sessionId, claudeSessionId>` for multi-turn resume.

**Binary path:** From `CLAUDE_BINARY_PATH` env var (set by desktop app when starting streams process).

**Auth:** From `CLAUDE_AUTH_*` env vars forwarded from desktop process.

### B2. Create `apps/streams/src/sdk-to-ai-chunks.ts`

Pure conversion module. Maps Claude SDK `SDKMessage` types to TanStack AI `StreamChunk`:

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
| `result` | `{ type: "finish", finishReason: "stop" }` | End of agent turn |
| `system` (init) | — | Extract `claudeSessionId` internally |
| `assistant` | — | Skip (stream_events already cover content) |

**ConversionState** tracks:
- Active content block indices (to correlate starts with deltas)
- JSON accumulator per tool_use block (for partial → full args)
- Current tool call IDs per block index

---

## Phase C: Update Client Packages

### C1. Update `packages/ai-chat`

**Remove** (replaced by vendored `@superset/durable-session`):
- `src/stream/client.ts`
- `src/stream/schema.ts`
- `src/stream/materialize.ts`
- `src/stream/materialize.test.ts`
- `src/stream/useChatSession.ts`
- `src/stream/useCollectionData.ts`
- `src/stream/actions.ts`

**Rewrite** `src/stream/index.ts`:
```typescript
export {
  DurableChatClient, createDurableChatClient,
  type MessageRow, type ConnectionStatus, type DurableChatCollections,
  type DurableChatClientOptions, type AgentSpec,
  sessionStateSchema, extractTextContent,
  isUserMessage, isAssistantMessage, messageRowToUIMessage,
} from "@superset/durable-session"

export {
  useDurableChat,
  type UseDurableChatOptions, type UseDurableChatReturn,
} from "@superset/durable-session/react"
```

**Update** `package.json`:
- Remove: `@durable-streams/client`, `@durable-streams/state`, `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`
- Add: `@superset/durable-session: workspace:*`

**Update** `src/types.ts`:
- Remove `StreamEvent`, `StreamEntry`, `Draft` types
- Keep `PresenceUser`, `ChatMessage`, `ChatSession`

### C2. Simplify desktop session manager

**Rewrite** `apps/desktop/.../session-manager.ts`:
- Remove `StreamWatcher`, `IdempotentProducer`, `processUserMessage()`
- Becomes thin HTTP orchestrator:
  - `startSession()` → PUT session on proxy + POST register Claude agent
  - `stopSession()` → DELETE agent + DELETE session
  - `interrupt()` → POST proxy `/v1/sessions/:id/stop`
- Keep `EventEmitter` for tRPC subscriptions

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

## Phase F: Desktop Chat UI

```
apps/desktop/src/renderer/screens/chat/
├── index.tsx
├── components/
│   ├── ChatSidebar.tsx
│   ├── ChatMessageList.tsx
│   ├── ChatMessage.tsx         -- Renders MessageRow with parts: TextPart, ToolCallPart, etc.
│   ├── ChatInput.tsx           -- Reuse from @superset/ai-chat
│   ├── PresenceBar.tsx         -- Reuse from @superset/ai-chat
│   └── TypingIndicator.tsx
└── stores/
    └── chat-store.ts
```

Usage in component:
```tsx
import { useDurableChat } from "@superset/ai-chat/stream"

function ChatRoom({ sessionId }: { sessionId: string }) {
  const {
    messages, sendMessage, isLoading, connectionStatus,
    collections, registerAgents,
  } = useDurableChat({
    sessionId,
    proxyUrl: "http://localhost:8080",
    actorId: userId,
    actorType: "user",
  })

  return (
    <div>
      <PresenceBar collections={collections} />
      {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
      {isLoading && <TypingIndicator />}
      <ChatInput onSend={sendMessage} />
    </div>
  )
}
```

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
| `@hono/node-server` | ^1.13.0 | apps/streams (dev server) |

**Already installed:**
- `@durable-streams/client` ^0.2.0, `@durable-streams/server` ^0.2.0, `@durable-streams/state` ^0.2.0
- `@tanstack/db` 0.5.22, `@tanstack/react-db` 0.1.66
- `@anthropic-ai/claude-agent-sdk` ^0.2.19
- `zod` ^4.3.5

## Environment Variables

```bash
# Desktop
DURABLE_STREAM_URL=http://localhost:8080      # Proxy URL (local dev)
CLAUDE_BINARY_PATH=...                        # Set by desktop when starting streams
CLAUDE_AUTH_TOKEN=...                         # Forwarded from desktop auth

# Streams server
PORT=8080                                     # Proxy port
DURABLE_STREAMS_URL=http://127.0.0.1:8081    # Internal durable stream server
CLAUDE_BINARY_PATH=...                        # Path to claude binary
CLAUDE_MODEL=claude-sonnet-4-5-20250929       # Default model

# Production
DURABLE_STREAM_URL=https://stream.superset.sh
```

---

## Implementation Order

1. **Phase A1** — Vendor `@superset/durable-session` package
2. **Phase A2** — Vendor proxy into `apps/streams`
3. **Phase B** — Claude agent endpoint + SDK-to-AI chunk converter
4. **Phase C** — Update `packages/ai-chat` + simplify session manager
5. **Phase D** — Database schema + migration
6. **Phase E** — API tRPC router
7. **Phase F** — Desktop chat UI
8. **Phase G** — Web chat UI

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `@tanstack/ai` API mismatch with vendored code | Build breaks | Vendored code uses `workspace:*` — pin to compatible published versions, fix API differences |
| SDKMessage → AI chunk conversion errors | Broken rendering | Comprehensive unit tests with real Claude output fixtures |
| Claude binary path outside Electron | Agent can't start | `CLAUDE_BINARY_PATH` env var set by desktop at streams startup |
| Multi-turn resume state lost on restart | Context lost | In-memory map + optional file-based persistence in data dir |
| Interrupt via HTTP abort | Claude subprocess continues | Agent detects fetch abort → calls `query.interrupt()` + `abortController.abort()` |
| Proxy `workspace:*` TanStack DB deps | Import errors | Pin all `@tanstack/*` to compatible published versions across monorepo |

---

## Verification

1. Proxy health: `curl http://localhost:8080/health`
2. Create session: PUT `/v1/sessions/test-1`
3. Register agent: POST `/v1/sessions/test-1/agents` with Claude agent endpoint
4. Send message: POST `/v1/sessions/test-1/messages` → verify agent invoked
5. Stream sync: GET `/v1/stream/sessions/test-1` → verify chunks arrive as SSE
6. Client integration: `useDurableChat({ sessionId: "test-1" })` → messages render
7. Interrupt: POST `/v1/sessions/test-1/stop` → generation halts
8. Reconnection: reload page → messages replayed from stream offset
9. Multi-client: open 2 tabs → both see same messages in real-time
