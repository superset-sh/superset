# Standalone Chat mode design

## Architecture

Standalone Chat is represented by cloud `chat_sessions` rows where both workspace columns are null:

- `workspaceId = null`
- `v2WorkspaceId = null`

This keeps Chat account-scoped and synced while avoiding a new table or migration.

## Renderer Boundaries

- `/chat` owns the standalone Chat page.
- `DashboardSidebar` routes Chat mode directly to `/chat`.
- `DashboardChatSidebar` queries only global chat sessions and no longer needs `activeWorkspaceId`.
- Code/V2 workspace routes can retain their own workspace chat code paths, but the top-level Chat product should not navigate there.

## Session Creation

`packages/trpc/src/router/chat/chat.ts#createSession` accepts an optional/null `v2WorkspaceId`. When absent, it inserts a standalone chat row with no workspace references.

The existing REST `/api/chat/:sessionId` route already supports no `workspaceId`; keep it compatible.

## Chat Runtime

Use the lower-level desktop chat runtime path that accepts an optional `cwd`. Standalone Chat calls it with no `cwd`, so it does not require a Worktree or host workspace.

Model selection should use cloud/provider model list fallback instead of workspace host model lookup when no workspace is present.

## Compatibility

No migration of old workspace chat sessions. They simply stop appearing in the top-level Chat list. If a legacy route still opens a workspace chat, it can continue using the old workspace-scoped session path.

## Rollback

Rollback is mostly renderer routing/query changes plus restoring `chat.createSession` to require `v2WorkspaceId`. No schema rollback is expected.
