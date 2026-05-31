# Cross Layer Thinking Guide

Use this guide when a change crosses database, tRPC, Electric, host-service, renderer, CLI, MCP, SDK, or relay boundaries.

## Trace The Data Flow

For cloud data, trace the path explicitly:

1. Drizzle schema and zod types in `packages/db/src/schema`.
2. API router in `packages/trpc/src/router/<domain>`.
3. API app context in `apps/api/src/trpc/context.ts` and route handlers under `apps/api/src/app/api`.
4. Electric shape authorization in `apps/electric-proxy/src/where.ts` if renderer or mobile live queries need the row.
5. Desktop/mobile collection or tRPC client consuming it.

For host-local data, trace:

1. Host-service runtime in `packages/host-service/src/runtime` or `terminal`.
2. Host-service tRPC router under `packages/host-service/src/trpc/router`.
3. Desktop renderer host client from `renderer/lib/host-service-client.ts` or `@superset/workspace-client`.
4. Renderer route/hook/state that renders the data.

## Organization And Host Scope

Every cloud row that is organization-owned must enforce organization scope in both write APIs and Electric shape filters. `packages/trpc/src/router/utils/org-resource-access.ts` and `apps/electric-proxy/src/where.ts` are the canonical places to check before adding a table or operation.

Host-routed operations must also check host availability and access. Relay routes in `apps/relay/src/index.ts` replay requests to the owning Fly machine and call `checkHostAccess` before proxying user traffic.

## IDs And Types

Keep IDs stable across layers. For v2 workspaces, `workspaceId`, `projectId`, `hostId`, and `organizationId` appear in DB rows, host-service runtime requests, Electric collections, route params, and sidebar local state. Do not change one layer without updating all consumers.

Distinguish task `statusId` from task status `type`. UI filters and icons use the status row's `type`, `position`, `color`, and `progressPercent`; writes set `statusId`.

## Sync And Readiness

Electric live queries can return persisted rows before a collection is ready. Render rows first. Use readiness only when there are no rows and the UI must choose loading versus empty. Delay non-idempotent writes until strict readiness.

## Events And Subscriptions

Host-service event bus, terminal websockets, and Electron tRPC subscriptions have transport-specific constraints. Electron IPC subscriptions must use `observable(...)`; terminal bytes should remain binary tails through `packages/pty-daemon` framing; relay websocket query tokens must be redacted from logs.

## Verification Checklist

- Schema exports, zod schemas, and Drizzle migrations are consistent.
- API router input/output types match CLI, MCP, SDK, and renderer callers.
- Electric `where.ts` includes new organization-scoped tables.
- Renderer collections include new rows and preserve cache-first rendering.
- Host-service changes keep `no-electron-coupling.test.ts` passing.
- Tests cover the layer where the behavior is easiest to isolate.
