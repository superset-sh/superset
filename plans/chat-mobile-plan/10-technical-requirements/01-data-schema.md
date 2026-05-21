# Data Schema

Mobile is a **read-mostly** client for chat. The only DB writes mobile triggers are session-metadata CRUD via the cloud chat router (`chat.createSession`, `chat.updateSession`, `chat.deleteSession`, `chat.updateTitle`). Mobile does NOT write messages — messages live in the host runtime memory and are returned via `chat.listMessages` / `chat.getSnapshot`.

## Existing tables consumed (no schema changes)

| Entity | Source | Purpose for mobile |
|---|---|---|
| `chat_sessions` | `packages/db/src/schema/schema.ts` (chatSessions table) | Session metadata: `id, organization_id, created_by, workspace_id, v2_workspace_id, title, last_active_at, created_at, updated_at`. Read via Electric shape. Written via cloud `chat.createSession` / `updateSession` / `deleteSession` / `updateTitle`. |
| `v2_workspaces` | `packages/db/src/schema/schema.ts` | Workspace metadata to filter sessions and bind new sessions to. Read via Electric shape (already wired in mobile collections). |

## Tables explicitly NOT touched

- `chat_attachments` — attachments deferred to a future mobile-chat PRD
- `chat_messages` / any messages table — **does not exist**; messages are runtime-resident, not persisted
