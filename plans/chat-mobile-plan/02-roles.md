---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-21
prd_version: 1.0.0
---

# Mobile Chat (v0) — Roles

| Role | Description |
|------|-------------|
| **User** | The Superset member using the mobile app. Owns at least one organization membership (`members` table). Has an active host-service running on either their own machine or a managed cloud host (`v2_hosts.host_id`). Authenticates via Better Auth (mobile uses `@better-auth/expo` already wired in `apps/mobile/lib/auth/client.ts`). All chat sessions in scope are scoped to a single `activeOrganizationId` resolved from the user's session. |
| **System** | The mobile app process running on the user's device: tRPC HTTP client against `@superset/host-service`'s `AppRouter` (relay-routed), ElectricSQL collections for session metadata, push-notification handler, bottom-sheet and FlashList renderers, Tiptap editor, reconnect/cursor protocol. The mobile process never executes agent tools or chat runtime logic — it is a thin client against the host-service. |
| **Host-service** | The Hono+tRPC server in `packages/host-service` running either on a user's local machine (legacy/desktop primary) or on a cloud-hosted v2 workspace host. Owns the Mastra harness, in-memory message store, tool dispatcher, and slash-command resolver. Mobile reaches it through `apps/relay`'s per-host WebSocket tunnel. **Not a user-facing role** but enumerated here because mobile UCs reference its behavior; mobile cannot deliver functionality without it being online. |

Out-of-scope roles for this PRD (mentioned in desktop chat but not relevant to mobile v0): **Admin** (no admin-level controls on mobile), **Dispatcher** (no Slack-style cross-system orchestration UI on mobile), **Subagent** (rendered read-only via UC-RENDER-06; not interactive).
