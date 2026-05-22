# Data Schema

## Scope clarification — mobile is fully read-write at the API level

Mobile is a **full read-write client** for chat at the API surface:

| Write surface | Procedures | Use case |
|---|---|---|
| Send a user message | `chat.sendMessage` (host) | UC-COMP-02 |
| Stop a running turn | `chat.stop` (host) | UC-COMP-03 |
| Respond to tool approval | `chat.respondToApproval` (host) | UC-PAUSE-01 |
| Respond to ask_user question | `chat.respondToQuestion` (host) | UC-PAUSE-02 |
| Respond to plan submission | `chat.respondToPlan` (host) | UC-PAUSE-03 |
| Resolve a slash command | `chat.resolveSlashCommand` (host) | UC-COMP-01 |
| End a session (dispose runtime) | `chat.endSession` (host) | UC-SESS-04 |
| Create / rename / delete session | `chat.createSession`, `chat.updateTitle`, `chat.deleteSession` (cloud) | UC-SESS-03, UC-SESS-04, UC-SESS-05 |

## Database-write surface — narrow by architecture, not by scope

The **DB writes** mobile triggers are limited to session-metadata CRUD via the cloud chat router (`chat.createSession`, `chat.updateSession`, `chat.deleteSession`, `chat.updateTitle`). This narrowness is an **architectural property** of the existing host-service, not a scope cut:

- **Messages do not exist as DB rows** anywhere in the system today. They live in **host runtime memory** (Mastra harness) on whichever host owns the session. Both desktop and mobile read messages via `chat.listMessages` / `chat.getSnapshot` against the host — neither client writes to a `chat_messages` table because that table does not exist (confirmed via repo-wide grep).
- **Mobile send-message IS a write** — it mutates host runtime state via `chat.sendMessage`. It just happens to not touch Postgres.
- If host-side message persistence ever ships (see scope deferral "Pure-Electric message persistence" in `01-scope.md`), mobile's write surface against the DB would expand. That's a separate PRD.

So: mobile WRITES heavily at the host-service API layer. Mobile writes lightly at the database layer. Both facts are true; do not conflate them.

## Existing tables consumed (no schema changes)

| Entity | Source | Purpose for mobile |
|---|---|---|
| `chat_sessions` | `packages/db/src/schema/schema.ts` (chatSessions table) | Session metadata: `id, organization_id, created_by, workspace_id, v2_workspace_id, title, last_active_at, created_at, updated_at`. Read via Electric shape. Written via cloud `chat.createSession` / `updateSession` / `deleteSession` / `updateTitle`. |
| `v2_workspaces` | `packages/db/src/schema/schema.ts` | Workspace metadata to filter sessions and bind new sessions to. Read via Electric shape (already wired in mobile collections). |

## Tables explicitly NOT touched

- `chat_attachments` — attachments deferred to a future mobile-chat PRD
- `chat_messages` / any messages table — **does not exist**; messages are runtime-resident, not persisted

## Host runtime message storage (architectural reference)

Messages are kept in a **per-session in-memory store on the host process** — not a single global array, and not a database table:

- Host owns a `Map<sessionId, RuntimeSession>` (`ChatRuntimeManager.runtimes` in `packages/host-service/src/runtime/chat/chat.ts`).
- Each `RuntimeSession` wraps a Mastra harness with its own `Memory` store — that's where the session's message thread lives.
- `chat.listMessages` and `chat.getSnapshot` read from that harness; `chat.sendMessage` mutates it. No DB hops on either path.
- `chat.endSession` disposes the `RuntimeSession` — the harness and its message thread are GC'd together. A re-opened session starts with a fresh runtime.
- The host runtime CAN evict sessions (process restart, memory pressure, explicit dispose). Mobile must treat "session not found in host runtime" as a valid error path on `getSnapshot` / `listMessages`, and recover via the host's `getOrCreateRuntime` semantics on the next call.

**Implication for mobile:** messages are not durable across host restarts. User-visible behavior is identical to desktop — sessions resume seamlessly when the host is alive, fall back gracefully when it isn't (covered by UC-PLATF-03 host-offline UX and UC-PLATF-02 resume snapshot). Mobile's optimistic-update reducer (UC-COMP-02) and reconcile-on-resume protocol (UC-PLATF-02) together handle the eviction case without surfacing a "messages disappeared" error to the user.
