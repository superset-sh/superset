# API Design

Mobile consumes **three API surfaces**.

## 1. Cloud tRPC (`apps/api`) — session metadata

Already implemented in `packages/trpc/src/router/chat/chat.ts`. Mobile uses these existing procedures:

| Procedure | Type | Use Case |
|---|---|---|
| `chat.getModels` | query | UC-COMP-04 (model picker) |
| `chat.createSession({ sessionId, v2WorkspaceId })` | mutation | UC-SESS-03 |
| `chat.updateSession({ sessionId, title?, lastActiveAt? })` | mutation | UC-SESS-04, UC-COMP-02 (lastActiveAt bump via host fire-and-forget) |
| `chat.updateTitle({ sessionId, title })` | mutation | UC-SESS-04 (rename in menu) |
| `chat.deleteSession({ sessionId })` | mutation | UC-SESS-05 |

Auth: `protectedProcedure` with `activeOrganizationId` resolved from better-auth session.

## 2. Host-service tRPC via relay (`apps/relay` → `packages/host-service`) — message operations

Already implemented in `packages/host-service/src/trpc/router/chat/chat.ts`. Mobile invokes these via the new mobile `host-service-client.ts` using `httpLink` against `${RELAY_URL}/hosts/${hostId}/trpc`:

| Procedure | Type | Use Case |
|---|---|---|
| `chat.getSnapshot({ sessionId, workspaceId })` | query | UC-SESS-02, UC-PLATF-02 |
| `chat.listMessages({ sessionId, workspaceId })` | query | UC-SESS-02 |
| `chat.getDisplayState({ sessionId, workspaceId })` | query | UC-RENDER-* state derivation, polling loop (desktop polls at ~4 FPS) |
| `chat.sendMessage({ sessionId, workspaceId, payload, metadata })` | mutation | UC-COMP-02 |
| `chat.endSession({ sessionId, workspaceId })` | mutation | UC-SESS-04 |
| `chat.stop({ sessionId, workspaceId })` | mutation | UC-COMP-03 |
| `chat.respondToApproval({ sessionId, workspaceId, payload: { decision } })` | mutation | UC-PAUSE-01 |
| `chat.respondToQuestion({ sessionId, workspaceId, payload: { questionId, answer } })` | mutation | UC-PAUSE-02 |
| `chat.respondToPlan({ sessionId, workspaceId, payload: { planId, response } })` | mutation | UC-PAUSE-03 |
| `chat.getSlashCommands({ workspaceId })` | query | UC-COMP-01 (slash popover) |
| `chat.previewSlashCommand({ workspaceId, text })` | mutation | UC-COMP-01 (slash command preview before resolve) |
| `chat.resolveSlashCommand({ workspaceId, text })` | mutation | UC-COMP-01 |

Auth: JWT bearer minted per the JWT-lifecycle sub-decision (deferred to sprint planning).

## 3. ElectricSQL Shape (`apps/electric-proxy`) — realtime session list

| Endpoint | Use Case |
|---|---|
| `GET ${API_URL}/api/electric/v1/shape?table=chat_sessions&where=organization_id='{org}'` | UC-SESS-01, UC-PLATF-05 |

Already exposed at `apps/electric-proxy/src/where.ts:136-137`. Mobile consumes via existing TanStack Electric DB Collection infrastructure (`@tanstack/electric-db-collection`, `electricCollectionOptions`).
