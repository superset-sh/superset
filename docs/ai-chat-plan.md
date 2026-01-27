# Multiplayer AI Chat with Claude Code

Build a real-time multiplayer AI chat powered by Claude Code SDK with Durable Streams for token streaming and Electric SQL for message persistence.

## Architecture Overview

```
Any Client (Web/Mobile)                 API                        Desktop (Electron)
┌─────────────────┐                 ┌─────────────────┐           ┌─────────────────┐
│ "Start session" │ ───tRPC call──▶ │ Write request   │ ────────▶ │ Picks up via    │
│ via API         │                 │ to Postgres     │           │ Electric sub    │
└─────────────────┘                 └─────────────────┘           └────────┬────────┘
                                                                           │
                                                                           │ Runs Claude SDK
                                                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Durable Stream Server (Fly)                             │
│  - Receives tokens from Desktop (POST)                                               │
│  - Fans out to all clients (GET ?live=true SSE)                                     │
│  - State Protocol for presence (typing, viewing)                                    │
└────────────────────────────────────────────────────────────────────────┬────────────┘
                                                                         │
All Clients                                                              │
┌─────────────────┐                                                      │
│ Subscribe to    │◀─────────────────────────────────────────────────────┘
│ Durable Stream  │
│ for live tokens │
└────────┬────────┘
         │ on message complete
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Electric SQL    │◀────│ Postgres (Neon) │◀── Desktop writes final message
│ syncs history   │     └─────────────────┘
└─────────────────┘
```

## Key Design Decisions

1. **Claude SDK runs locally on desktop** - Desktop has access to Keychain/API key, no token transport needed
2. **API triggers sessions** - Any client can start a session via tRPC API; desktop with workspace open picks it up via Electric subscription
3. **Durable Streams for live tokens** - Resumable, multi-client streaming (not Postgres per-token writes)
4. **Postgres for completed messages only** - Single write on completion, Electric syncs history
5. **State Protocol for presence** - Typing indicators, who's viewing
6. **TanStack DB already installed** - Use existing `@tanstack/db` in desktop app
7. **Separate Fly app for stream server** - Clean separation, independent scaling

## Claude SDK Streaming Format

The Claude Agent SDK provides a clean, structured streaming format when `includePartialMessages: true`:

```typescript
// SDK emits SDKPartialAssistantMessage for each streaming event
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: RawMessageStreamEvent; // Standard Anthropic streaming events
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
}

// RawMessageStreamEvent follows Anthropic's standard protocol:
// message_start → content_block_start → content_block_delta → content_block_stop → message_delta

// Text deltas look like:
{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }

// Tool use deltas:
{ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"file" } }
```

This structured format maps cleanly to our Durable Stream events - we can forward each `content_block_delta` directly.

---

## Phase 1: Database Schema

### Files to Create/Modify

**`packages/db/src/schema/chat.ts`** (new)
```typescript
// Chat sessions - org-scoped
export const chatSessions = pgTable("chat_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  repositoryId: uuid("repository_id").references(() => repositories.id),
  workspaceId: text("workspace_id"),
  title: text().notNull(),
  claudeSessionId: text("claude_session_id"), // For resume
  cwd: text(), // Working directory
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// Completed messages only (not streaming tokens)
export const chatMessages = pgTable("chat_messages", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  role: text().notNull(), // "user" | "assistant"
  content: text().notNull(),
  toolCalls: jsonb("tool_calls"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Who can access each session
export const chatParticipants = pgTable("chat_participants", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => chatSessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text().notNull().default("viewer"), // "owner" | "editor" | "viewer"
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});
```

**`packages/db/src/schema/index.ts`** - Export new tables

**`apps/api/src/app/api/electric/[...path]/route.ts`** - Add WHERE clauses for chat tables

---

## Phase 2: Claude Binary Bundling

### Files to Create/Modify

**`apps/desktop/scripts/download-claude-binary.ts`** (new)
- Download Claude Code binary from `https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases`
- Platform detection: darwin-arm64, darwin-x64, linux-x64, win32-x64
- SHA256 verification
- Store at `apps/desktop/resources/bin/${platform}-${arch}/claude`

**`apps/desktop/electron-builder.ts`** - Add to extraResources:
```typescript
extraResources: [
  // ... existing
  {
    from: "resources/bin/${platform}-${arch}",
    to: "bin",
    filter: ["**/*"],
  },
],
```

**`apps/desktop/src/main/lib/claude/binary.ts`** (new)
```typescript
export function getBundledClaudeBinaryPath(): string {
  const isDev = !app.isPackaged;
  const resourcesPath = isDev
    ? path.join(app.getAppPath(), "resources/bin", `${platform}-${arch}`)
    : path.join(process.resourcesPath, "bin");
  return path.join(resourcesPath, platform === "win32" ? "claude.exe" : "claude");
}
```

**`apps/desktop/src/main/lib/claude/auth.ts`** (new)
```typescript
// Read from Keychain (macOS), credentials file (Windows/Linux), or ANTHROPIC_API_KEY
export function getExistingClaudeCredentials(): { accessToken: string } | null
export function buildClaudeEnv(): Record<string, string>
```

---

## Phase 3: Claude SDK Integration (Desktop)

### Files to Create

**`apps/desktop/src/main/lib/claude/session-manager.ts`** (new)
- Manages Claude SDK sessions
- Spawns bundled binary with user's auth
- Streams tokens to Durable Stream
- Emits events for local tRPC subscription

**`apps/desktop/src/main/lib/trpc/routers/ai-chat.ts`** (new)
```typescript
export const aiChatRouter = router({
  // Start or resume a session
  startSession: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      cwd: z.string(),
      claudeSessionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => { ... }),

  // Send message and trigger Claude
  sendMessage: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      content: z.string(),
    }))
    .mutation(async ({ input }) => { ... }),

  // Local token stream (observable pattern per AGENTS.md)
  streamTokens: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(({ input }) => {
      return observable<StreamEvent>((emit) => {
        // Subscribe to session manager events
        return () => { /* cleanup */ };
      });
    }),

  // Interrupt generation
  interrupt: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => { ... }),
});
```

**`apps/desktop/src/main/lib/trpc/routers/index.ts`** - Add aiChatRouter

---

## Phase 4: API Session Trigger

The API handles session creation and message sending. When a client (web/mobile) wants to start a chat:

1. Client calls API `chat.createSession` or `chat.sendMessage`
2. API writes session/message request to Postgres
3. Desktop app subscribed to workspace picks up via Electric subscription
4. Desktop runs Claude SDK and streams to Durable Stream
5. All clients see tokens via Durable Stream subscription

**API Router (in `packages/trpc/src/router/chat/index.ts`):**
```typescript
export const chatRouter = createTRPCRouter({
  // Create a new chat session
  createSession: protectedProcedure
    .input(z.object({
      repositoryId: z.string().uuid().optional(),
      workspaceId: z.string().optional(),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Insert into chat_sessions table
      // Returns sessionId
    }),

  // Send a message (triggers Claude on desktop)
  sendMessage: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Insert user message into chat_messages
      // Desktop picks this up and runs Claude
    }),

  // ... other CRUD operations
});
```

**Desktop subscription:**
```typescript
// Subscribe to pending messages for workspaces user has open
const pendingMessages = electricClient.stream({
  shape: {
    table: "chat_messages",
    where: `session_id IN (...) AND role = 'user' AND NOT processed`,
  }
});

pendingMessages.subscribe((messages) => {
  for (const msg of messages) {
    runClaudeSession(msg);
  }
});
```

---

## Phase 5: Durable Stream Server (Separate Fly App)

**`apps/stream-server/`** (new Fly app)
```
apps/stream-server/
├── package.json
├── Dockerfile
├── fly.toml
└── src/
    ├── index.ts          # Hono server
    ├── streams.ts        # Durable Stream handlers
    └── presence.ts       # State Protocol handlers
```

Dependencies: `@durable-streams/server`, `@durable-streams/state`, `hono`

Endpoints:
- `PUT /streams/:sessionId` - Create stream
- `POST /streams/:sessionId` - Append tokens
- `GET /streams/:sessionId` - Read with `?live=true` for SSE
- `POST /streams/:sessionId/presence` - Update presence
- `GET /streams/:sessionId/presence` - Get presence state

---

## Phase 6: API tRPC Router (Full Implementation)

Extends the router from Phase 4 with all CRUD operations:

**`packages/trpc/src/router/chat/index.ts`**
```typescript
export const chatRouter = createTRPCRouter({
  // From Phase 4
  createSession: protectedProcedure.input(...).mutation(...),
  sendMessage: protectedProcedure.input(...).mutation(...),

  // Additional endpoints
  listSessions: protectedProcedure
    .input(z.object({ repositoryId: z.string().uuid().optional() }))
    .query(...),
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(...),
  getMessages: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(...),
  saveAssistantMessage: protectedProcedure  // Called by desktop on complete
    .input(z.object({
      sessionId: z.string().uuid(),
      content: z.string(),
      toolCalls: z.any().optional(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    }))
    .mutation(...),
  archiveSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(...),
});
```

**`packages/trpc/src/root.ts`** - Add chatRouter

---

## Phase 7: Client Hooks

### Shared Hook Package

**`packages/ai-chat/src/hooks/useDurableStream.ts`** (new)
```typescript
export function useDurableStream(sessionId: string | null) {
  // Subscribe to Durable Stream via SSE
  // Track offset for resume
  // Return: { streamingContent, isConnected, events }
}
```

**`packages/ai-chat/src/hooks/usePresence.ts`** (new)
```typescript
export function usePresence(sessionId: string | null, user: User) {
  // Poll/subscribe to presence
  // Heartbeat for viewing status
  // Return: { viewers, typingUsers, setTyping }
}
```

**`packages/ai-chat/src/hooks/useMultiplayerChat.ts`** (new)
```typescript
export function useMultiplayerChat(sessionId: string) {
  // Combine:
  // - Electric SQL for completed messages
  // - Durable Stream for live tokens
  // - Presence for typing indicators
  // Return: { messages, sendMessage, viewers, typingUsers, isStreaming }
}
```

---

## Phase 8: Desktop Chat UI

**`apps/desktop/src/renderer/screens/chat/`** (new)
```
screens/chat/
├── index.tsx              # Route component
├── components/
│   ├── ChatSidebar.tsx    # Session list
│   ├── ChatMessageList.tsx
│   ├── ChatMessage.tsx
│   ├── ChatInput.tsx
│   ├── PresenceBar.tsx
│   └── TypingIndicator.tsx
└── stores/
    └── chat-store.ts      # Zustand for UI state
```

Use existing UI components from `@superset/ui` and `packages/ui/src/components/ai-elements/`

---

## Phase 9: Web Chat UI

Web can create sessions and send messages via API. Desktop picks up and runs Claude.

**`apps/web/src/app/(dashboard)/chat/`** (new)
```
chat/
├── page.tsx               # Session list
├── [sessionId]/
│   └── page.tsx           # Chat room (view + send via API)
└── components/
    ├── ChatMessageList.tsx
    ├── ChatMessage.tsx
    ├── ChatInput.tsx       # Calls api.chat.sendMessage
    ├── PresenceBar.tsx
    └── TypingIndicator.tsx
```

**Key difference from desktop**: Web sends messages via API, doesn't run Claude locally. Desktop with workspace open handles execution.

---

## Dependencies to Add

**Root `package.json`:**
```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.2.12",
  "@durable-streams/client": "^0.1.0",
  "@durable-streams/server": "^0.1.0",
  "@durable-streams/state": "^0.1.0"
}
```

Note: `@tanstack/db`, `@tanstack/react-db`, `@electric-sql/client` already installed in desktop app.

---

## Environment Variables

```bash
# Desktop
DURABLE_STREAM_URL=https://stream.superset.sh

# API
DURABLE_STREAM_INTERNAL_URL=http://stream-server.internal:8080

# Stream Server (Fly)
STREAM_STORAGE=cloudflare-kv  # or redis
```

---

## Verification

1. **Binary bundling**: `bun run build` in desktop, verify claude binary in release/
2. **Auth resolution**: Test with API key env var, then with existing Keychain auth
3. **Local streaming**: Send message, verify tokens appear in desktop UI
4. **Durable Stream**: Disconnect/reconnect, verify resume from offset
5. **Multi-client**: Open web + desktop, verify both see same tokens
6. **Presence**: Start typing in one client, verify indicator in other
7. **Persistence**: Refresh page, verify completed messages load from Electric

---

## Implementation Order

1. **Database schema** - Chat tables + migration
2. **API chat router** - Session/message CRUD (triggers desktop via Electric)
3. **Claude binary** - Download script + electron-builder bundling
4. **Auth resolution** - Keychain/API key reading
5. **Session manager** - Claude SDK integration + Electric subscription for triggers
6. **Durable Stream server** - Deploy to Fly with stream + presence endpoints
7. **Desktop → Durable Stream** - POST tokens from session manager
8. **Client hooks** - useDurableStream, usePresence, useMultiplayerChat
9. **Desktop chat UI** - Chat screen with Electric SQL history
10. **Web chat UI** - View + send messages via API

---

## Critical Files Summary

| File | Purpose |
|------|---------|
| `packages/db/src/schema/chat.ts` | Chat tables |
| `packages/trpc/src/router/chat/index.ts` | API tRPC (session/message CRUD, triggers desktop) |
| `apps/desktop/scripts/download-claude-binary.ts` | Binary download |
| `apps/desktop/src/main/lib/claude/` | Binary path, auth, session manager |
| `apps/desktop/src/main/lib/trpc/routers/ai-chat.ts` | Desktop tRPC (local control) |
| `apps/stream-server/` | Durable Stream server (Fly) |
| `packages/ai-chat/src/hooks/` | Shared client hooks |
| `apps/desktop/src/renderer/screens/chat/` | Desktop UI |
| `apps/web/src/app/(dashboard)/chat/` | Web UI |
