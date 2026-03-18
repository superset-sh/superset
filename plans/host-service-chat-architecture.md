# Host-Service Chat Architecture

## Summary

This doc defines how chat should work in the host-service architecture.

The goal is not to port the current desktop chat stack 1:1. The goal is to make
chat a first-class host capability in the same way terminal, pull requests, and
workspace git state are host capabilities.

The core idea:

- cloud remains the source of truth for shared chat session metadata
- host-service owns local runtime execution for workspace-bound chat sessions
- renderer talks to host-service for chat lifecycle and runtime interaction
- Mastracode still powers the local agent runtime, but no longer lives behind
  desktop-only Electron tRPC

## Status

- Owner: platform/chat + platform/workspaces
- Scope: local desktop host first
- Last updated: 2026-03-17

## What Exists Today

Current chat is split across three different runtime boundaries.

### 1. Desktop main process hosts the live Mastracode runtime

The active chat runtime is created in:

- `packages/chat/src/server/trpc/service.ts`

That service:

- creates Mastracode runtimes via `createMastraCode(...)`
- keeps a `RuntimeSession` map in memory
- exposes session methods such as:
  - `getDisplayState`
  - `listMessages`
  - `sendMessage`
  - `restartFromMessage`
  - `stop`
  - approvals/questions/plans

Desktop exposes this through Electron tRPC in:

- `apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.ts`

### 2. Desktop main process separately hosts chat support services

Desktop also exposes a separate "chat service" for:

- auth status and credential management
- slash command discovery/resolution
- file search
- MCP overview

Main files:

- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/server/desktop/router/router.ts`
- `apps/desktop/src/lib/trpc/routers/chat-service/index.ts`

### 3. Session bootstrap still uses API routes

Desktop still creates and deletes chat session records through API routes:

- `apps/api/src/app/api/chat/[sessionId]/route.ts`
- `apps/api/src/app/api/chat/[sessionId]/stream/route.ts`

And the active chat pane still calls those routes from:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/hooks/useChatPaneController/useChatPaneController.ts`

These API routes currently do two things:

- manage canonical `chat_sessions` rows in Postgres
- create/delete durable streams for those sessions

### 4. Host-service does not own chat yet

Host-service currently owns:

- project/workspace creation and deletion
- git status
- pull request runtime
- terminal websocket sessions

Main entrypoints:

- `packages/host-service/src/app.ts`
- `packages/host-service/src/trpc/router/router.ts`

There is no chat runtime or chat router mounted in host-service today.

## Goals

- make chat a host-service runtime capability
- bind chat sessions to local workspaces hosted by host-service
- preserve Mastracode as the local agent runtime
- keep cloud-backed `chat_sessions` as the canonical shared session record in v1
- remove the requirement that desktop main process own live chat runtimes
- allow the same chat contract to eventually work for:
  - local desktop hosts
  - cloud hosts
  - remote device hosts
- minimize drift from the current working chat behavior while validating the new
  host-service path

## Non-Goals (v1)

- do not redesign the renderer chat experience in this doc
- do not move canonical session metadata from cloud Postgres into host-service
- do not solve remote/cloud host execution in the first implementation
- do not migrate old durable-stream semantics in this doc
- do not commit to final event transport yet if polling/request-response is
  enough for the first host-service version

## Locked Constraints

- workspace-bound chat must execute in the workspace's local checkout
- canonical session metadata is already represented by `chat_sessions` in
  `packages/db/src/schema/schema.ts`
- desktop already relies on Electric replication of `chat_sessions`
- current Mastracode auth resolution is desktop-local and must be adapted
  deliberately for host-service
- host-service already has a runtime object on context and should own more
  runtime subsystems over time
- the first host-service version should be built in parallel to the current chat
  stack, not by progressively mutating the current desktop runtime in place

## Desired End State

### High-level ownership

Cloud owns:

- `chat_sessions`
- session titles and metadata visible across devices
- auth-protected shared APIs

Host-service owns:

- local Mastracode runtime instances
- workspace cwd resolution
- local provider credential resolution through a shared provider/settings layer
- local file search / slash commands / MCP overview
- runtime lifecycle and ephemeral state

Renderer owns:

- pane/session selection UI
- optimistic UI state
- calling host-service chat routes

### Runtime model

For a local workspace chat session:

1. renderer selects or creates a cloud `chat_session`
2. renderer calls host-service chat routes for that session + workspace
3. host-service resolves the local workspace checkout
4. host-service creates or reuses a Mastracode runtime for that session
5. host-service performs normal chat operations against that runtime

## Proposed Host-Service Design

## 1. Add `runtime.chat` to host-service

Host-service should gain a chat runtime manager, similar in role to the pull
request runtime manager.

It should be created in:

- `packages/host-service/src/app.ts`

And mounted on context as:

- `ctx.runtime.chat`

Suggested shape:

```ts
interface HostChatRuntime {
  getDisplayState(input): Promise<...>
  listMessages(input): Promise<...>
  sendMessage(input): Promise<...>
  restartFromMessage(input): Promise<...>
  stop(input): Promise<void>
  respondToApproval(input): Promise<...>
  respondToQuestion(input): Promise<...>
  respondToPlan(input): Promise<...>
  getMcpOverview(input): Promise<...>
  authenticateMcpServer(input): Promise<...>
  searchFiles(input): Promise<...>
  ensureSessionRuntime(input): Promise<...>
}
```

Internally this should manage:

- `Map<sessionId, RuntimeSession>`
- in-flight runtime creations
- runtime lifecycle event forwarding
- workspace resolution
- title generation

## 2. Keep workspace as the execution boundary

The host runtime should not accept arbitrary cwd as the primary model forever.

The real execution boundary should be:

- `workspaceId`

The runtime manager should resolve:

- `workspaceId -> local workspace row -> worktreePath`

From host-service local DB:

- `packages/host-service/src/db/schema.ts`

Passing raw `cwd` should be treated as transitional compatibility only if we
need it during migration.

## 3. Keep cloud `chat_sessions` as canonical metadata in v1

The canonical session record should remain in shared Postgres for now:

- `packages/db/src/schema/schema.ts`

This is important because desktop already consumes:

- `chat_sessions`
- `session_hosts`

via Electric collections.

So the host-service chat runtime should not try to replace the session table in
v1. It should treat cloud `chat_sessions` as the source of truth for:

- session identity
- organization scope
- workspace link
- title
- listing/order metadata

## 4. Add a host-service chat router

Host-service should expose chat through its own tRPC router namespace.

Suggested namespace:

- `chat`

- `getDisplayState`
- `listMessages`
- `sendMessage`
- `restartFromMessage`
- `stop`
- `respondToApproval`
- `respondToQuestion`
- `respondToPlan`
- `getSlashCommands`
- `resolveSlashCommand`
- `previewSlashCommand`
- `getMcpOverview`

Chat should not own provider credential CRUD.

Those flows should move under a dedicated model-provider credential layer rather
than staying chat-owned.

In host-service terms, the direction we discussed is:

- `providers/git/...` for git credentials
- `providers/model-providers/...` for Anthropic/OpenAI credential
  resolution

The model-provider layer should own:

- provider auth status
- API key CRUD
- OAuth start/complete/disconnect
- env config overrides

Chat should only consume the resolved provider/runtime config through an
internal adapter.

## Provider Credential Adapter Requirement

This is the most important non-trivial design problem.

Current auth resolution is not "cloud auth." It is a mix of:

- Mastracode auth storage
- Claude config files
- macOS keychain lookup
- managed env config
- API key management
- OAuth session state

Relevant current files:

- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/server/desktop/auth/anthropic/anthropic.ts`
- `packages/chat/src/server/desktop/auth/openai/openai.ts`

Current UI ownership is already drifting this way:

- the settings page uses `chatServiceTrpc.auth.*` for the actual writes
- `electronTrpc.modelProviders.getStatuses` already derives higher-level provider
  status for settings UI

So the current code already suggests that provider auth/config should stop being
chat-owned.

Host-service cannot just reuse that implicitly. It needs an explicit credential
resolution abstraction.

### Proposed interfaces

Provider/settings-owned code should resolve generic provider credentials, not
Mastracode-specific runtime config.

```ts
type AnthropicCredential =
  | {
      kind: "api_key";
      apiKey: string;
      source: "auth-storage" | "config" | "keychain" | "env";
    }
  | {
      kind: "oauth";
      accessToken: string;
      headers: {
        "anthropic-beta": string;
        "user-agent": string;
        "x-app": string;
      };
      source: "auth-storage" | "config";
      expiresAt?: number;
    };

type OpenAICredential =
  | {
      kind: "api_key";
      apiKey: string;
      source: "auth-storage";
    }
  | {
      kind: "oauth";
      accessToken: string;
      source: "auth-storage";
      accountId?: string;
      expiresAt?: number;
    };

interface ModelProviderCredentialResolver {
  getAnthropicCredential(): Promise<AnthropicCredential | null>;
  getOpenAICredential(): Promise<OpenAICredential | null>;
}
```

Host-service chat should then adapt those generic credentials into the exact
inputs Mastracode needs when creating a runtime.

```ts
interface MastraCodeProviderOptionsAdapter {
  toRuntimeProviderOptions(input: {
    anthropic: AnthropicCredential | null;
    openai: OpenAICredential | null;
  }): {
    env?: Record<string, string>;
    // other Mastracode/provider-specific options as needed
  };
}
```

This keeps provider resolution reusable for other AI features, such as:

- naming workspaces
- generating summaries
- future host-owned automation outside chat

### Initial implementation

For local desktop host-service, the adapter can still use the same local
mechanisms as desktop main does today:

- `createAuthStorage()`
- Claude config files
- keychain
- managed env config

But it should be owned by a shared model-provider/settings subsystem, then
consumed by host-service chat through an adapter, not owned by chat itself.

That keeps the behavior stable while moving the boundary.

### Why not pass auth state from the renderer?

Renderer should not become the credential transport layer for chat.

The better boundary is:

1. settings/provider flows persist credentials once
2. host-service resolves effective provider credentials locally
3. host-service chat adapts those credentials into Mastracode inputs at runtime
   creation time

That keeps chat focused on runtime execution rather than credential management.

### Existing code we can reuse

Most of the provider-resolution logic already exists today in desktop-owned
chat code and should be extracted rather than rewritten from scratch.

Relevant files:

- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/server/desktop/chat-service/auth-storage-utils.ts`
- `packages/chat/src/server/desktop/auth/anthropic/anthropic.ts`
- `packages/chat/src/server/desktop/auth/openai/openai.ts`
- `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx`

The settings page is already a UI over these flows. The architectural change is
to move ownership of that credential resolution out of chat and let host-service
consume it through the new resolver interface.

## Session Lifecycle In The Host Model

### Session create

In v1, session creation should likely remain cloud-first:

1. create `chat_sessions` row through API/trpc
2. persist/update `session_hosts` if needed
3. renderer opens pane for that session
4. host-service lazily creates runtime on first real interaction

This avoids moving too many concerns at once.

### Session runtime creation

When renderer first calls a host chat method for a session:

1. host-service validates the workspace exists locally
2. host-service resolves session -> workspace binding
3. host-service resolves credentials
4. host-service creates Mastracode runtime in that workspace cwd
5. host-service stores runtime in local in-memory map

### Session delete

Deletion should remain cloud-first in v1:

1. delete `chat_sessions` row and any cloud durable-stream state if it still
   exists
2. host-service destroys any in-memory runtime for that session

## Transport Decision

For local desktop host-service, keep this simple:

- renderer -> host-service tRPC over local HTTP

This mirrors the pattern already used for pull requests and workspace state.

For now, chat does not need a new special transport just because the old stack
used a different one.

### Reads and updates

The minimal host-service chat can work over request/response for:

- display state
- messages
- send/restart/stop/respond

### Streaming

We should not assume the final event transport in this doc yet.

Reason:

- current chat UI already knows how to poll/requery display state/messages
- the host-service architecture may eventually want SSE or WebSocket for chat
- but we do not need to decide the final stream protocol to move runtime
  ownership into host-service

So v1 can begin with request/response and add event streaming once the host
runtime boundary is correct.

## Renderer Migration Plan

Current renderer wiring:

- `ChatPane` mounts providers from `@superset/chat/client`
- runtime calls go to Electron IPC client for `chatRuntimeService`
- support calls go to Electron IPC client for `chatService`

Main files:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPane.tsx`
- `apps/desktop/src/renderer/components/Chat/utils/chat-service-client.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/utils/chat-runtime-service-client.ts`

Target migration:

1. keep renderer view model and pane UX mostly intact
2. swap chat clients from Electron IPC to host-service clients
3. keep API/session bootstrap logic temporarily if needed
4. remove Electron main chat routers after host-service parity

## V2 Workspace Rollout

The first host-service-backed chat experience should live in the new v2
workspace surface.

### Initial UI shape

Use a top-level tab group in the v2 workspace page to switch between:

- the current v2 workspace layout
- a new chat surface for that workspace

This is explicitly an iteration path, not the final pane architecture.

### Important constraints

- do not redesign pane persistence around this first rollout
- do not block on the future pane-storage model
- keep the chat UI visually aligned with the current chat experience so we can
  validate the transport/runtime migration independently

That means the first v2 workspace chat should preserve the existing chat UI
patterns as closely as possible:

- session switcher in the top bar
- same message list / composer UX
- same slash-command behavior
- same model picker behavior
- same approval/question/plan UX

Only the transport/runtime boundary should change:

- old path: renderer -> Electron chat routers / legacy API session plumbing
- new path: renderer -> workspace host-service chat router

### Why this is the right rollout

- fast iteration without rewriting pane storage
- validates host-service chat in the place where workspace-native runtime
  features are already moving
- reduces surface area compared to replacing the entire old chat pane path at
  once
- lets us preserve familiar UX while changing the architecture underneath

## Suggested Phases

## Phase 1: establish host-service chat core

- create host-service chat runtime manager
- move reusable runtime logic behind host-service
- move slash-command/file-search/MCP helpers into host-service-owned chat
  modules
- move provider auth/config ownership toward a shared provider/settings layer
- let host-service chat consume provider runtime config through an adapter
- expose host-service `chat.*` router

Goal:

- host-service can create and drive a local Mastracode runtime for a workspace

## Phase 2: move renderer transport

- add renderer host-service chat clients
- add host-service-backed chat surface to v2 workspaces
- preserve the existing chat UI structure while swapping transport/runtime
  ownership
- keep cloud `chat_sessions` as-is
- keep compatibility session bootstrap paths if needed

Goal:

- first real chat UX no longer depends on Electron main chat routers

## Phase 3: remove desktop-main chat runtime ownership

- delete `chatRuntimeService` Electron router
- delete `chatService` Electron router
- remove desktop main process runtime ownership for chat

Goal:

- host-service is the only local chat runtime owner

## Phase 4: decide final session/bootstrap cleanup

- decide whether `/api/chat/[sessionId]` compatibility routes remain necessary
- decide whether durable streams remain part of the architecture
- decide whether session-host binding belongs in API, host-service, or both

## Open Questions

### 1. Where should title generation live?

Current title generation updates cloud `chat_sessions.title`.

Options:

- keep it in host-service and call shared API/tRPC mutation
- move it to cloud after first message write

Likely answer:

- keep it in host-service for now, because it is coupled to the local runtime
  prompt lifecycle

### 2. Should host-service own a local chat cache or DB tables?

Possibly useful later for:

- runtime snapshots
- local message cache
- local indexing

But likely not needed for the first migration, because canonical session metadata
and messages already have existing paths.

### 3. What replaces durable streams?

Current old API chat routes still manage durable streams.

Open question:

- do we still need durable stream replay once host-service is the runtime owner?

Likely answer:

- not for the first migration decision
- defer until the host runtime boundary is in place

### 4. How should session-host affinity work?

There is already a shared `session_hosts` table.

We need to decide whether host-service should:

- register itself as the active host for a session
- claim/reclaim sessions explicitly
- remain stateless about host ownership in v1

### 5. Do we keep direct Mastracode auth storage forever?

Probably not as the long-term abstraction.

But for local desktop host-service, reusing the current mechanisms is likely the
fastest way to preserve behavior while relocating ownership.

### 6. Should MCP management follow the same ownership model?

Probably yes.

There is a strong parallel between:

- provider auth/config used by chat
- user-managed MCP configuration used by chat/runtime features

Longer term, both likely belong in shared host-owned settings/config layers that
runtime subsystems consume through adapters.

But MCP settings migration is out of scope for the first host-service chat
implementation.

## Recommended First Implementation Slice

The first real build slice should be:

1. create host-service `chat.*` routes and runtime manager
2. create host-service runtime manager capable of:
   - ensure/create runtime for `{ sessionId, workspaceId }`
   - `getDisplayState`
   - `listMessages`
   - `sendMessage`
   - `stop`
3. define a provider runtime-config resolver that host-service chat can consume
4. keep cloud session creation as-is
5. point one desktop chat pane path at host-service behind a feature flag

This would validate the architecture without forcing session/bootstrap or stream
decisions too early.

## Implementation Approach

The first host-service version should be a parallel reimplementation.

That means:

- do not heavily rewrite the current desktop chat runtime in place
- do not force the existing chat stack to become host-service-aware piece by
  piece
- build the host-service chat runtime as a separate path with the same external
  behavior where possible
- reuse proven runtime logic selectively, but keep the new ownership boundary
  explicit

This minimizes risk and keeps the cutover reversible until the host-service
path has real parity.

## Implementation Checklist

- [ ] Add `runtime.chat` to host-service app/context
- [ ] Define host-service chat router contract
- [ ] Reimplement host-service chat runtime alongside the current desktop chat
      runtime
- [ ] Reuse proven logic where appropriate without tightly coupling the new
      host-service runtime to the existing desktop runtime
- [ ] Extract provider credential resolution into a shared provider/settings-owned
      module
- [ ] Define generic provider credential shapes
- [ ] Define Mastracode adapter from provider credentials to runtime creation
      inputs
- [ ] Resolve `workspaceId -> worktreePath` as the primary runtime boundary
- [ ] Add renderer host-service chat client
- [ ] Feature-flag host-service-backed chat pane path
- [ ] Cut over active chat pane from Electron main tRPC to host-service
- [ ] Remove old Electron chat runtime routers
- [ ] Revisit old API chat session/bootstrap/stream routes after cutover
