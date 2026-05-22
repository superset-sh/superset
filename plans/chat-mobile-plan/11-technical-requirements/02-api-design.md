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

## 3. ElectricSQL Shapes (`apps/electric-proxy`) — realtime collections

All four data sources mobile needs for the chat surface are **already exposed** by `apps/electric-proxy/src/where.ts` and only require new mobile Electric collections to consume them:

| Endpoint (table) | Org-scoped via | Use Cases | Where in mobile |
|---|---|---|---|
| `chat_sessions` | `organization_id` | UC-SESS-01, UC-NAV-01/02, UC-PLATF-05 | New collection in `apps/mobile/lib/collections/collections.ts` |
| `v2_workspaces` | `organization_id` | UC-NAV-02 (workspace headers), UC-NAV-04 (workspace picker) | New collection |
| `v2_hosts` | `organization_id` | UC-NAV-03 (host picker — online state) | New collection |
| `v2_users_hosts` | `organization_id` | UC-NAV-03 (which hosts this user can access) | New collection (or derived selector joining v2_users_hosts × v2_hosts × current userId) |

All four cases are present in `where.ts:49-133` (case statements for `v2_hosts`, `v2_users_hosts`, `v2_workspaces`, and `chat_sessions`). Mobile consumes via existing TanStack Electric DB Collection infrastructure (`@tanstack/electric-db-collection`, `electricCollectionOptions` — the same shape used today for tasks/projects/members in `apps/mobile/lib/collections/collections.ts`).

**Client-side scoping for NAV:**
- Sessions list (UC-NAV-01/02): filter `chat_sessions` by `selectedHostId` via a join through `v2_workspaces` (workspace row carries `host_id`), then group by `v2_workspace_id`, ordered by `lastActiveAt` desc.
- Host picker (UC-NAV-03): list `v2_hosts` where `(organization_id, machine_id)` joins to `v2_users_hosts` for the current user, with `is_online` driving the badge.
- Workspace picker (UC-NAV-04): list `v2_workspaces` where `host_id == selectedHostId`, sorted by max session `lastActiveAt` then name.

No new tRPC procedures or cloud-router additions are required for the NAV surface — it's a pure client-side selector over already-published Electric shapes.
