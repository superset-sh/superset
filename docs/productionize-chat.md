# Productionize Chat GUI

Full plan to take the AI chat from prototype to production, following established deployment patterns.

## Current State

| Component | Location | Status |
|-----------|----------|--------|
| Streams server (Hono + Durable Streams) | `apps/streams/` | Built, `fly.toml` exists, **not in CI/CD** |
| Durable session client + `useDurableChat` | `packages/durable-session/` | Built |
| Claude agent endpoint | `apps/streams/src/claude-agent.ts` | Built |
| AI element components (39+) | `packages/ui/src/components/ai-elements/` | Built |
| Desktop chat tRPC router | `apps/desktop/src/lib/trpc/routers/ai-chat/` | Built |
| Desktop chat renderer UI | `apps/desktop/.../ChatPane/` | Built |
| Web app chat UI | `apps/web/` | **Not built** |
| Auth on streams endpoints | `apps/streams/` | **Not built** |
| Chat history DB persistence | `packages/db/src/schema/` | **Not built** |
| Streams in production CI/CD | `.github/workflows/` | **Not built** |
| Streams in preview CI/CD | `.github/workflows/` | **Not built** |
| Observability (Sentry/PostHog) | `apps/streams/` | **Not built** |

## Established Deployment Patterns

These are the patterns already used in the repo. Chat should follow the same conventions.

| Concern | Pattern | Example |
|---------|---------|---------|
| Next.js apps | **Vercel** via `vercel deploy --prod --prebuilt` | `deploy-production.yml` |
| Stateful/streaming services | **Fly.io** via `fly deploy` or `superfly/fly-pr-review-apps` | `fly.toml` (ElectricSQL) |
| Database | **Neon PostgreSQL** with per-PR branch | `neondatabase/create-branch-action@v6` |
| Secrets | **GitHub Secrets** per environment (`production`, `preview`) | All workflows |
| Error tracking | **Sentry** (`@sentry/nextjs`, per-app DSN) | Web, API, Marketing, Admin, Docs, Desktop |
| Analytics | **PostHog** (`posthog-js` client, `posthog-node` server) | Web, Admin |
| CI | **GitHub Actions** — sherif, lint, test, typecheck, build | `ci.yml` |
| Preview | Full isolated env per PR (Neon branch + Electric + all Vercel apps) | `deploy-preview.yml` |
| Cleanup | Delete preview resources on PR close | `cleanup-preview.yml` |

---

## Phase 1: Deploy Streams Server to Production

**Goal:** Get `apps/streams` reliably running on Fly.io with CI/CD.

### 1.1 Add `deploy-streams` job to `deploy-production.yml`

The streams server already has `fly.toml` (`app = "superset-stream"`, region `iad`, port 8080). Add a deploy job that follows the same pattern as ElectricSQL.

```yaml
# .github/workflows/deploy-production.yml
deploy-streams:
  name: Deploy Streams to Fly.io
  runs-on: ubuntu-latest
  environment: production

  steps:
    - uses: actions/checkout@v4

    - uses: superfly/flyctl-actions/setup-flyctl@master

    - name: Deploy to Fly.io
      run: flyctl deploy --config apps/streams/fly.toml --remote-only
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

    - name: Set secrets
      run: |
        flyctl secrets set \
          ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}" \
          STREAMS_SECRET="${{ secrets.STREAMS_SECRET }}" \
          --app superset-stream
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Secrets to add to GitHub:**
- `STREAMS_SECRET` — bearer token for auth (generate a random 64-char string)

**Env vars to add to `.env.example`:**
- `STREAMS_URL` — production URL (e.g., `https://superset-stream.fly.dev`)
- `STREAMS_SECRET` — bearer token for authenticated requests

### 1.2 Add streams to preview deployments (`deploy-preview.yml`)

Follow the ElectricSQL preview pattern with `superfly/fly-pr-review-apps`:

```yaml
deploy-streams-preview:
  name: Deploy Streams (Fly.io)
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v4

    - name: Deploy Streams preview to Fly.io
      uses: superfly/fly-pr-review-apps@1.3.0
      with:
        name: superset-stream-pr-${{ github.event.pull_request.number }}
        region: iad
        org: ${{ vars.FLY_ORG }}
        config: apps/streams/fly.toml
        secrets: |
          ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
          STREAMS_SECRET=${{ secrets.STREAMS_SECRET }}
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Add to preview env:
```
STREAMS_ALIAS: superset-stream-pr-${{ github.event.pull_request.number }}.fly.dev
```

### 1.3 Add streams cleanup to `cleanup-preview.yml`

```yaml
- name: Destroy Streams Fly.io app
  uses: superfly/fly-pr-review-apps@1.3.0
  with:
    name: superset-stream-pr-${{ github.event.pull_request.number }}
    org: ${{ vars.FLY_ORG }}
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### 1.4 Verify `fly.toml` is production-ready

Current config is reasonable. Consider bumping resources for production:

```toml
# apps/streams/fly.toml
[[vm]]
  memory = "512mb"   # bump from 256mb for production
  cpu_kind = "shared"
  cpus = 1
```

The `auto_stop_machines = "stop"` + `auto_start_machines = true` + `min_machines_running = 1` config is correct — one machine always warm, extras auto-scale.

---

## Phase 2: Auth on Streams Endpoints

**Goal:** Prevent unauthorized access to chat sessions.

### 2.1 Bearer token middleware

Add a Hono middleware in `apps/streams/src/server.ts` that validates the `Authorization: Bearer <token>` header against `STREAMS_SECRET`. This is the simplest approach that works for both desktop and web clients.

```
Request flow:
  Client → Bearer token in header → Streams server validates → Allow/Deny
```

**Scope:** All `/v1/sessions/*` routes. Exclude `/health`.

### 2.2 Per-user session isolation (future)

For multi-tenant production, sessions should be scoped to authenticated users. This requires:
1. Pass the user's session token (from Better Auth) to the streams server
2. Streams server validates the token against the API (`apps/api`)
3. Session IDs are prefixed/scoped per user

This can be a follow-up — bearer token auth is sufficient for initial launch.

---

## Phase 3: Web App Chat UI

**Goal:** Add chat to `apps/web` using the same components and hooks already built.

### 3.1 Chat route

Create a chat page in the web app. The exact route depends on product decisions (standalone `/chat` page vs. embedded panel), but the wiring is the same:

```
apps/web/src/app/(app)/chat/
├── page.tsx          # Chat page
├── components/
│   └── ChatView/
│       ├── ChatView.tsx      # Main chat container
│       └── index.ts
└── hooks/
    └── useChatSession/
        ├── useChatSession.ts # Session lifecycle
        └── index.ts
```

### 3.2 Wire up `useDurableChat`

The hook from `packages/durable-session` is client-agnostic. Connect it to the streams server:

```typescript
const { messages, sendMessage, isLoading, stop } = useDurableChat({
  sessionId,
  proxyUrl: env.NEXT_PUBLIC_STREAMS_URL,
  autoConnect: true,
  stream: {
    headers: { Authorization: `Bearer ${authToken}` },
  },
});
```

### 3.3 Reuse `packages/ui/src/components/ai-elements/`

The 39+ AI element components are already published from `packages/ui`. Import and compose:

- `conversation.tsx` — message list container
- `message.tsx` — individual messages
- `prompt-input.tsx` — input with file attachment
- `tool-call.tsx`, `bash-tool.tsx`, etc. — tool rendering
- `reasoning.tsx` — extended thinking display
- `model-selector.tsx` — model picker

### 3.4 Add `NEXT_PUBLIC_STREAMS_URL` to web deployment

Add to `deploy-production.yml` `deploy-web` job and `deploy-preview.yml`:

```
NEXT_PUBLIC_STREAMS_URL=https://superset-stream.fly.dev  # production
NEXT_PUBLIC_STREAMS_URL=https://superset-stream-pr-{N}.fly.dev  # preview
```

---

## Phase 4: Chat History Persistence

**Goal:** Persist completed chat sessions to PostgreSQL so users can browse history.

### 4.1 Database schema

Add tables to `packages/db/src/schema/`:

```typescript
// chat-sessions table
export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),            // durable stream session ID
  userId: text("user_id").notNull().references(() => users.id),
  workspaceId: text("workspace_id"),      // optional, for workspace-scoped chats
  title: text("title"),                   // auto-generated or user-edited
  model: text("model"),                   // e.g. "claude-sonnet-4-5-20250929"
  messageCount: integer("message_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// chat-messages table (optional — only if search/export needed)
export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),            // message ID from durable stream
  sessionId: text("session_id").notNull().references(() => chatSessions.id),
  role: text("role").notNull(),           // "user" | "assistant"
  content: text("content"),               // plain text content
  parts: jsonb("parts"),                  // full TanStack AI MessagePart[]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 4.2 Persist on session end

When a chat session completes (all generations done), the streams server writes the session summary to the database. Two approaches:

**Option A: Webhook from streams to API.** Streams server POSTs to `apps/api` on session end. API writes to DB. This keeps DB access in the API layer.

**Option B: Direct write from streams.** Streams server connects to Neon directly. Simpler, but requires `DATABASE_URL` in streams env.

Recommend **Option A** — follows existing separation of concerns (API owns DB writes).

### 4.3 Chat history API

Add a tRPC router in `apps/api` for listing/searching chat sessions:

```
chatSession.list       → paginated list for current user
chatSession.get        → single session with messages
chatSession.rename     → update title
chatSession.delete     → soft delete
```

---

## Phase 5: Observability

**Goal:** Match the monitoring level of other production services.

### 5.1 Sentry for streams server

Add `@sentry/bun` (or `@sentry/node`) to `apps/streams`:

```typescript
import * as Sentry from "@sentry/bun";

Sentry.init({
  dsn: process.env.SENTRY_DSN_STREAMS,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

**Secret to add:** `SENTRY_DSN_STREAMS` — create a new Sentry project under `superset-sh` org.

### 5.2 PostHog events

Track key chat events server-side from streams:

| Event | Properties |
|-------|------------|
| `chat_session_started` | `sessionId`, `model`, `userId` |
| `chat_message_sent` | `sessionId`, `role`, `messageLength` |
| `chat_tool_executed` | `sessionId`, `toolName`, `approved` |
| `chat_session_ended` | `sessionId`, `messageCount`, `durationMs` |
| `chat_error` | `sessionId`, `errorType`, `errorMessage` |

Use `posthog-node` (already a dependency in the monorepo).

### 5.3 Structured logging

Replace `console.log` with structured JSON logs following existing patterns:

```typescript
console.log("[streams/session] Session started:", { sessionId, model, userId });
console.error("[streams/agent] Claude SDK error:", { sessionId, error: err.message });
```

---

## Phase 6: Hardening

**Goal:** Production safety for user-facing traffic.

### 6.1 CORS

Configure Hono CORS middleware in `apps/streams/src/server.ts`:

```typescript
app.use("*", cors({
  origin: [
    process.env.ALLOWED_ORIGIN_WEB,    // e.g. https://app.superset.sh
    process.env.ALLOWED_ORIGIN_DESKTOP, // electron:// or localhost for dev
  ].filter(Boolean),
  credentials: true,
}));
```

### 6.2 Rate limiting

Rate limit at the session/message level:

| Endpoint | Limit |
|----------|-------|
| `PUT /v1/sessions/:id` (create) | 10/min per user |
| `POST /v1/sessions/:id/messages` (send) | 30/min per session |

Implement with Upstash Redis (already used in the monorepo via `KV_REST_API_URL`):

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, "1 m"),
});
```

### 6.3 Input validation

- Max message length (e.g., 100KB)
- Session ID format validation (UUID)
- Model allowlist validation
- Sanitize tool outputs before persisting

### 6.4 Graceful shutdown

Handle `SIGTERM` in the streams server for Fly.io rolling deploys:

```typescript
process.on("SIGTERM", async () => {
  console.log("[streams] SIGTERM received, draining connections...");
  // Stop accepting new sessions
  // Wait for active generations to complete (with timeout)
  // Close durable stream connections
  process.exit(0);
});
```

---

## Phase 7: Desktop App Updates

**Goal:** Point desktop chat at production streams server.

### 7.1 Config resolution

Desktop tRPC router (`apps/desktop/src/lib/trpc/routers/ai-chat/`) already has a `getConfig()` procedure that returns `{ proxyUrl, authToken }`. Update it to:

1. Read `STREAMS_URL` from `.env` (loaded in main process)
2. Pass the user's auth token (from Better Auth desktop flow)

### 7.2 Desktop auto-update

Desktop canary builds (`release-desktop-canary.yml`) will pick up chat changes automatically since chat code lives in `apps/desktop/src/renderer/`. No workflow changes needed.

---

## Implementation Order

```
Phase 1: Deploy Streams (CI/CD)
  ├── 1.1 Add deploy-streams to deploy-production.yml
  ├── 1.2 Add deploy-streams-preview to deploy-preview.yml
  ├── 1.3 Add cleanup to cleanup-preview.yml
  └── 1.4 Verify fly.toml resources

Phase 2: Auth
  └── 2.1 Bearer token middleware on streams

Phase 3: Web Chat UI
  ├── 3.1 Chat route in apps/web
  ├── 3.2 Wire useDurableChat
  ├── 3.3 Compose ai-elements
  └── 3.4 Add STREAMS_URL to web deploys

Phase 4: Persistence
  ├── 4.1 DB schema (chatSessions, chatMessages)
  ├── 4.2 Session-end webhook → API → DB
  └── 4.3 Chat history tRPC router

Phase 5: Observability
  ├── 5.1 Sentry in streams
  ├── 5.2 PostHog events
  └── 5.3 Structured logging

Phase 6: Hardening
  ├── 6.1 CORS
  ├── 6.2 Rate limiting (Upstash)
  ├── 6.3 Input validation
  └── 6.4 Graceful shutdown

Phase 7: Desktop updates
  ├── 7.1 Config resolution for production URL
  └── 7.2 Desktop auto-update (no changes needed)
```

Phases 1-2 are prerequisites. Phases 3-7 can largely be parallelized.

---

## Secrets Checklist

New secrets to add to GitHub (production + preview environments):

| Secret | Purpose | Where |
|--------|---------|-------|
| `STREAMS_SECRET` | Bearer auth for streams API | `apps/streams`, clients |
| `SENTRY_DSN_STREAMS` | Error tracking for streams | `apps/streams` |
| `NEXT_PUBLIC_STREAMS_URL` | Streams server URL (client-side) | `apps/web` |
| `STREAMS_URL` | Streams server URL (server-side) | `apps/api` (for webhooks) |

Existing secrets already available:
- `ANTHROPIC_API_KEY` — already in GitHub secrets
- `FLY_API_TOKEN` — already used for ElectricSQL
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — already used for rate limiting
- `POSTHOG_API_KEY` — already used across apps

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fly.io single machine for streams | Downtime during deploys | `min_machines_running = 1` + rolling deploys. Scale to 2 machines if latency matters. |
| LMDB data on Fly.io volumes | Data loss if volume fails | Durable streams are ephemeral by design. Persist completed sessions to PostgreSQL (Phase 4). |
| Anthropic API rate limits | Users blocked from chatting | Per-user rate limiting (Phase 6.2), queue overflow to retry, display user-facing error. |
| Claude Agent SDK instability | Agent crashes mid-conversation | Sentry alerts (Phase 5.1), session resumption (already built into SDK). |
| Cost runaway (Anthropic tokens) | Unexpected bills | Budget limits via `maxBudgetUsd` in agent config (already supported), admin dashboard monitoring. |
