---
stability: CONSTITUTION
last_validated: 2026-05-18
prd_version: 1.0.0
---

# Technical Requirements

## System Components (v2 chat surface)

| Component | Role | Polish UCs that touch it |
|-----------|------|--------------------------|
| **v2 ChatPane (renderer)** | React tree at `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/`. Hosts user input, message list, slash-command UI, model picker, pending-question/plan/approval surfaces. | V2UI-01 through V2UI-07 |
| **useWorkspaceChatDisplay hook** | Renderer-side state hook (366 lines). Polls `chat.getSnapshot` at adaptive fps, manages optimistic state, exposes `commands` (sendMessage, stop, respondToApproval/question/plan). | V2UI-01, V2UI-02, V2UI-03 |
| **@superset/workspace-client** | tRPC React client over HTTP to host-service. `workspaceTrpc.chat.*` is the v2 chat API surface. `workspaceClientsCache` module-level cache. | V2UI-05 |
| **WorkspaceProvider + WorkspaceClientProvider** | Provider tree that mints per-workspace tRPC clients and QueryClients. | V2UI-05 |
| **Electron preload** | `apps/desktop/src/preload/index.ts` — `contextBridge` surface shared by v1 + v2 windows. Open `ipcRenderer` relay today. | HOST-01 |
| **Desktop tRPC core** | `apps/desktop/src/lib/trpc/index.ts` — only `publicProcedure` exported today. Sentry middleware wraps every procedure. | HOST-03 |
| **hostServiceCoordinator (router + service)** | `apps/desktop/src/lib/trpc/routers/host-service-coordinator/` + `main/lib/host-service-coordinator.ts`. Spawns/supervises the host-service Bun child. | HOST-02, HOST-05, HOST-08 |
| **host-service manifest** | `~/.superset/host/{orgId}/manifest.json`. Persists PSK + PID for adoption. | HOST-05 |
| **host-service (Bun)** | `packages/host-service/` — independently deployable Bun HTTP server. Hosts the Mastra runtime + chat tRPC router. | HOST-07, HOST-09, HOST-10 |
| **ChatService** | Currently in `@superset/chat/server/desktop`. Manages OAuth loopback HTTP servers + `mastracode` auth storage. Imported by host-service today; relocated to Electron main in this PRD. | HOST-09 |
| **ChatRuntimeManager** | `packages/host-service/src/runtime/chat/chat.ts` (799 lines). Owns `Map<sessionId, RuntimeSession>` and Mastra harness lifecycle. | RUN-01 through RUN-08 |
| **LocalModelProvider** | `packages/host-service/src/providers/model-providers/LocalModelProvider/`. Resolves Anthropic + OpenAI credentials, mutates `process.env` today. | RUN-01, RUN-08 |
| **notifications router** | `packages/host-service/src/trpc/router/notifications/notifications.ts`. Reachable through the relay tunnel. | HOST-04 |
| **tunnel-client** | `packages/host-service/src/tunnel/tunnel-client.ts`. Cloud WebSocket relay for remote workspaces. *Mostly deferred to follow-up; not in this PRD's scope except indirectly via ChatService extraction.* | (related: HOST-04 via relay reachability) |

## Data Schema Changes

None required by this PRD. The polish work is behavioral/structural — no new entities, no new columns. Host-service `workspaces` table is unchanged. Cloud `chat_sessions` table is unchanged.

Optional, dependent on UC-HOST-10 outcome:
- If v1 stack is deprecated, the unused v1 columns/tables (none identified explicitly) can be removed in a follow-up migration PRD.

## API Design

### New / Modified tRPC procedures

| Procedure | Layer | Change |
|-----------|-------|--------|
| `apps/desktop/src/lib/trpc/index.ts` | Electron IPC | NEW: export `protectedProcedure` + `orgScopedProcedure` (UC-HOST-03) |
| `hostServiceCoordinator.{start,restart,reset,getConnection,getProcessStatus,onStatusChange}` | Electron IPC | CHANGED: `publicProcedure` → `orgScopedProcedure` (UC-HOST-02) |
| `hostServiceCoordinator.drain(organizationId)` (or equivalent internal) | Electron IPC | NEW: drains in-flight chat turns before SIGTERM (UC-HOST-08). May be internal-only. |
| `host-service notifications.hook` | host-service HTTP | CHANGED: `publicProcedure` → `protectedProcedure` with HMAC scoped to terminal; `terminalId: z.string()` → `z.string().uuid()` (UC-HOST-04) |
| `host-service protectedProcedure` middleware | host-service HTTP | CHANGED: add window-claim verification asserting caller owns `input.workspaceId` (UC-RUN-06) |
| `host-service chat.getMcpOverview` | host-service HTTP | EITHER removed entirely OR returns a discriminated union with real introspection (UC-RUN-03) |
| `host-service chat.stop` | host-service HTTP | CONTRACT CHANGE: documented as awaitable, returns after `agent_end` or 5s timeout (UC-RUN-02). No body change required if the underlying behavior already matches; documentation + integration test only. |

### New IPC channels (Electron main ↔ host-service spawn)

| Channel / Spawn-config field | Direction | Purpose |
|------------------------------|-----------|---------|
| `SpawnConfig.resolvedCredentials` | main → host-service (at spawn) | Initial Anthropic + OpenAI credentials sealed at spawn time (UC-HOST-09 + UC-RUN-01) |
| `creds.refresh` | main → host-service (in-session) | Refreshes resolved credentials when OAuth tokens expire (UC-RUN-08 + UC-HOST-09) |
| `OAuthFlowResult` | main internal | New module under `apps/desktop/src/main/lib/auth/` owns the OAuth loopback server (UC-HOST-09) |

### Renderer ↔ host-service request headers

| Header | Source | Validated by | UC |
|--------|--------|--------------|-----|
| `Authorization: Bearer <PSK>` | renderer (PSK from manifest) | `PskHostAuthProvider.validate` | existing |
| `X-Workspace-Claim: <HMAC>` (NEW) | renderer (per-window claim minted by Electron main) | `protectedProcedure` middleware (UC-RUN-06) | UC-HOST-04 (issuance) + UC-RUN-06 (enforcement) |

### Architecture diagram (post-polish)

```
+--------------------------------------------+
|  Electron Renderer (v2 ChatPane)           |
|  - useWorkspaceChatDisplay (adaptive fps)  |
|  - signature-based optimistic recon        |
|  - unmount cleanup fires commands.stop()   |
|  - workspaceClientsCache evicts on unmount |
+----------------+---------------------------+
                 |
                 | HTTP (workspaceTrpc)
                 | Authorization: Bearer <PSK>
                 | X-Workspace-Claim: <HMAC>  (NEW)
                 |
                 v
+--------------------------------------------+
|  host-service (Bun, 127.0.0.1:<ephemeral>) |
|  - PskHostAuthProvider                     |
|  - protectedProcedure validates            |
|    X-Workspace-Claim against ctx           |
|  - ChatRuntimeManager                      |
|    - Map<sessionId, RuntimeSession>        |
|    - per-invocation credentials (NEW)      |
|    - disposeRuntime fires SessionEnd + dst |
|    - idle-TTL sweep                        |
|    - stop is awaitable                     |
|    - title generation restored             |
+----+--------------------+------------------+
     |                    |
     | IPC handshake      | IPC tRPC
     | (resolved creds,   | (chatRuntimeService /
     |  creds.refresh)    |  chatService — v1, fate
     v                    |  in UC-HOST-10)
+--------------------------------------------+
|  Electron Main                             |
|  - hostServiceCoordinator (orgScoped)      |
|  - ChatService (relocated, OAuth loopback) |
|  - secure-storage / safeStorage wrapper    |
|  - drain on before-quit                    |
|  - preload allowlist (ALLOWED_CHANNELS)    |
+--------------------------------------------+
     |
     | reaches cloud API for session records,
     | updateTitle (if host-side ownership)
     v
+--------------------------------------------+
|  Cloud API (apps/api)                      |
|  - chat.createSession, chat.updateSession  |
|  - chat.updateTitle (per UC-RUN-07)        |
+--------------------------------------------+
```

## External Dependencies

| Component | Dependency | Documentation |
|-----------|------------|---------------|
| host-service Mastra runtime | `mastracode` `createMastraCode` API | https://mastra.ai/docs (provider docs; project pins version in `packages/host-service/package.json`) |
| host-service Mastra runtime | `@mastra/memory`, `@mastra/mcp`, `@mastra/core` | https://mastra.ai/docs |
| host-service model provider | `@ai-sdk/anthropic`, `@ai-sdk/openai` | https://sdk.vercel.ai/docs |
| Electron main | `safeStorage` (Electron built-in) | https://www.electronjs.org/docs/latest/api/safe-storage |
| Renderer transport | `@trpc/react-query`, `@trpc/client` | https://trpc.io/docs |
| host-service HTTP | `hono` + `@hono/node-server` | https://hono.dev/docs |
| host-service tunnel | WebSocket (`ws` or equivalent) | (cloud relay docs — internal) |
| Renderer state | `@tanstack/react-query` + `@tanstack/react-db` | https://tanstack.com/query, https://tanstack.com/db |

## UI Infrastructure

No new design libraries, no new tokens. All UCs reuse:
- `@superset/ui` shadcn-based component library
- Existing error tokens for the inline error surface in UC-V2UI-04 (`PendingQuestionMessage`)
- Existing `select-text cursor-text` Tailwind utility composition (project rule per `apps/desktop/AGENTS.md`)

Reusable components touched (no new ones introduced):
- `Conversation` / `ConversationContent` scroll surface from `@superset/ui/ai-elements`
- `Dropdown`/`DropdownMenu` for the SessionSelector (already in use)
- Error rendering wrapper — implementer should check whether a shared `<ErrorAlert>` exists in `@superset/ui` before inlining

## Testing Strategy

| Layer | Test type | Notes |
|-------|-----------|-------|
| **Renderer** | Vitest + React Testing Library, co-located `*.test.tsx` per UC. MSW for `workspaceTrpc` fixtures — **no mocking of host-service core logic** (SUPREME RULE). | UC-V2UI-01..07 |
| **host-service runtime** | Integration tests against a real `createMastraCode` runtime (no mocking of `@mastra/*`). Bun test runner. | UC-RUN-01..08 |
| **host-service tRPC** | `createCaller` with a real `PskHostAuthProvider` + a real claim header — **no `{ isAuthenticated: true } as ...` bypasses** (this PRD does not include the test-auth-bypass cleanup, but new tests written for these UCs must use real auth). | UC-HOST-02..04, UC-RUN-06 |
| **Electron main** | Vitest with a fake `BrowserWindow` and a fake child-process; assert lifecycle ordering, drain semantics, PSK rotation. | UC-HOST-05, UC-HOST-08 |
| **Cross-layer** | One end-to-end test per cross-layer UC (run renderer + host-service together against real Mastra; assert behavior end-to-end). | UC-V2UI-07/UC-HOST-08, UC-RUN-02, UC-RUN-06, UC-HOST-09 |
| **Architectural invariants** | Build-time check via `bun build` smoke test OR static import-graph walker. | UC-HOST-07 |
| **Regression guards (grep gates)** | CI grep gate fails PRs that introduce `process.env[...] =`/`delete process.env[...]` inside `packages/host-service/src/providers/` (UC-RUN-01), or `.sync()` inside `packages/host-service/src/runtime/` (deferred follow-up). | UC-RUN-01 |

## Migration / Rollout

- **v1 stack**: UC-HOST-10 produces the decision artifact; rollout plan is part of that decision (soft-flag, forced upgrade, or permanent dual-stack).
- **Preload allowlist (UC-HOST-01)**: requires enumeration of every existing `window.ipcRenderer.invoke|send|on` call. Ship behind a dev-mode-only warn-log flag for one release, then enforce in next release.
- **PSK rotation + Keychain seal (UC-HOST-05)**: requires a migration path for users with existing plaintext manifests — on first launch after the update, the coordinator re-seals the existing PSK if it's still valid, or respawns with a fresh one.
- **`X-Workspace-Claim` header (UC-RUN-06 + UC-HOST-04)**: must roll out atomically — renderer starts sending; host-service starts enforcing. Behind a feature flag for one release; remove flag in the next.
- **`abort` removal (UC-RUN-02 + V2UI deletion)**: TypeScript build will fail at any remaining `commands.abort()` callers — that's the migration mechanism.
- **`getMcpOverview` removal (UC-RUN-03 option a)**: Renderer's `useMcpUi` consumer must be removed in the same PR.

## Cross-Layer Coordination Map

| Pair | Renderer owns | Host-side owns | Coordination |
|------|---------------|----------------|--------------|
| Abort/stop contract | Delete `abort` field from `UseChatDisplayReturn` | UC-RUN-02 awaitable `stop` contract | Same PR or paired PRs |
| Pane-close drain | UC-V2UI-07 cleanup on unmount | UC-HOST-08 `before-quit` drain | Two PRs, renderer first (idempotent), then host-side as backstop |
| Per-session ownership | Renderer attaches `X-Workspace-Claim` header | UC-HOST-04 mints claim; UC-RUN-06 enforces | Feature-flag rollout |
| ChatService extraction | (none — invisible to renderer) | UC-HOST-09 main; UC-RUN consumes via IPC | Single coordinated PR |
| `no-electron-coupling` | (none) | UC-HOST-07 (walker) + extract pure helper package | UC-HOST-07 lands AFTER helper extraction so it doesn't fail on existing imports |

## Open Architectural Questions (must resolve before sprint planning locks)

1. **UC-HOST-10 v1 deprecation** — deprecate v1 on a dated milestone, or formal dual-stack? Affects UC-HOST-01 (channels to enumerate) and UC-HOST-09 (whether ChatService leaves a v1 stub behind).
2. **UC-RUN-03 MCP fate** — remove `getMcpOverview` and ship MCP-disabled, or implement properly now? Recommend remove for v2 GA, defer re-enable to a dedicated MCP-rework PRD.
3. **UC-RUN-07 title-generation ownership** — host-service or cloud? v1 was host-side; v2's cloud session model could absorb it.
4. **UC-HOST-04 / UC-RUN-06 window-claim TTL** — per-window-session (cleared on window close) is safer; per-app-session is easier. Recommend per-window-session.
5. **UC-HOST-06 production CORS posture** — document `file://` blank-origin behavior + PSK-is-sole-auth, OR explicitly register `null` as allowed-origin. Recommend the former (more honest).
