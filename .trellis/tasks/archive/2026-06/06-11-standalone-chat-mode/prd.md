# Standalone Chat mode

## Goal

Make the top-level Chat product a standalone, account-level chat surface like ChatGPT. Chat must no longer require or imply a Workspace, Worktree, Task, host device, or Trellis context.

Code continues to own Workspace/Worktree/Terminal/Trellis/Task execution. Work remains the future A2A/process collaboration surface.

Existing workspace-scoped chat history does not need to be migrated or preserved for this internal beta phase. There are no online production users for this Chat surface yet, so the implementation may prioritize a clean standalone data model over backwards compatibility.

## Requirements

- `/chat` renders the actual chat experience, not a workspace picker.
- Switching the left mode selector to Chat always navigates to `/chat`, regardless of the currently active Workspace.
- The Chat sidebar lists account-level chat sessions only: `chat_sessions.workspace_id is null` and `chat_sessions.v2_workspace_id is null`.
- Creating a Chat session writes a cloud `chat_sessions` row for the active organization/user with both workspace columns empty.
- Chat sessions and their list remain cloud/account-synced through the existing Electric/TanStack collection path.
- Chat model selection continues to use the configured provider/model center and must work without a Workspace/host-specific provider lookup.
- Old Workspace-scoped chat rows may be ignored by the new Chat UI. No backwards-compatible migration is required.
- The top-level Chat UI should feel like a pure chat page: session list on the left, conversation canvas in the main panel, composer at the bottom, no project/workspace/host status requirement.
- Existing Code workspace chat routes may remain in code if needed for current internal paths, but the primary Chat product must not route users there.

## Acceptance Criteria

- [ ] `/chat` loads without selecting a Workspace and shows a usable chat composer.
- [ ] `/chat` does not show "Choose a workspace", "Select a workspace", Workspace title, branch, or host status as a prerequisite.
- [ ] The Chat mode switcher route is `/chat` even when the user was previously inside `/v2-workspace/:workspaceId`.
- [ ] New chat creates a cloud chat session with `workspaceId = null` and `v2WorkspaceId = null`.
- [ ] The Chat sidebar displays only account-level standalone chat sessions and can open/delete them.
- [ ] Sending a message from the standalone page creates/uses the standalone session and does not require a Workspace ID.
- [ ] Focused tests cover global session creation/filtering/navigation where practical.
- [ ] Desktop smoke verifies `/chat` renders the standalone UI without a Workspace dependency.

## Notes

- Database schema already has nullable `chat_sessions.workspace_id` and `chat_sessions.v2_workspace_id`; prefer no migration unless implementation proves a hard constraint elsewhere.
- Old Chat data can be discarded/ignored because the product is still in internal beta.
