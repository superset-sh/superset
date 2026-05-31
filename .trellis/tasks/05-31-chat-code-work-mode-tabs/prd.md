# Chat Code Work mode tabs

## Goal

Introduce a Claude Code-like top-level mode switch in the desktop dashboard so the left rail can switch between `Chat`, `Code`, and `Work`. Each mode should own a distinct sidebar/content experience. The first implementation should keep `Code` as the existing V2 workspace experience, make `Chat` reuse Superset's existing chat runtime/UI, and reserve `Work` as a visible but intentionally deferred tab.

User value:

- Users can move between broad work modes without mixing unrelated navigation models in one long sidebar.
- The app can evolve toward three first-class surfaces:
  - `Chat`: conversational assistant surface.
  - `Code`: current workspace/code surface.
  - `Work`: future multi-agent/A2A collaboration surface.
- The left column becomes the long-term shell for mode switching, similar to Claude Code's app-level tab design.

## Confirmed Facts

- The desktop app is now V2-only and routes authenticated users to `/v2-workspaces` or `/v2-workspace/$workspaceId`.
- The current left sidebar is `DashboardSidebar`, mounted in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`.
- `DashboardSidebarHeader` currently owns global navigation actions such as Workspaces, Automations, Tasks & PRs, New Workspace, and Add repository.
- The current `Code` experience is the existing V2 workspace route: `/_authenticated/_dashboard/v2-workspace/$workspaceId`.
- The current V2 workspace main content uses `@superset/panes` for tabs/panes and can open terminal, chat, browser, file, diff, and comment panes.
- Workspace chat already exists as `ChatPane` under the V2 pane registry and is backed by `@superset/chat`, `workspaceTrpc`, and Mastracode/Mastra runtime code.
- There is still older V1/screen chat code under `screens/main/...`, but the V2 route has its own copied `WorkspaceChatInterface`; this task should prefer the V2 path.
- `Work` has no current product surface in this repo that matches the desired A2A multi-agent collaboration concept, so it should be a reserved mode for now.

## Requirements

- Add an app-level mode switch for `Chat`, `Code`, and `Work` in the left column.
- Preserve `Code` as the current default mode and current V2 workspace experience.
- Switching to `Code` should return users to the existing Code route/context where possible.
- Add `Chat` as a selectable workspace-scoped mode that uses the existing Superset chat implementation rather than building a new chat backend.
- Keep the `Work` tab visible for information architecture, but do not implement Work/A2A collaboration in this task.
- Mode switching must feel like a top-level shell change, not just another item inside the existing Workspaces/Tasks list.
- The design must work in both expanded and collapsed left-sidebar states.
- Existing routes for Workspaces, Tasks, Automations, settings, and workspace panes must not regress.
- Persist or restore the user's last meaningful Code location when switching away and back, if feasible without broad routing churn.

## Acceptance Criteria

- [ ] Expanded left sidebar shows a clear `Chat / Code / Work` mode switch near the top, with `Code` selected by default.
- [ ] Collapsed left sidebar still exposes mode switching with icon buttons and tooltips.
- [ ] `Code` mode renders the existing DashboardSidebar project/workspace navigation and existing V2 workspace/workspaces routes.
- [ ] `Chat` mode renders a chat-focused panel for the active workspace using the existing Superset chat runtime/UI path.
- [ ] If Chat mode is opened without an active workspace, the app provides a clear choose/create workspace path instead of a blank panel.
- [ ] `Work` mode tab remains visible but clearly deferred and does not route to a broken page.
- [ ] Switching modes does not destroy existing Code workspace tab/pane state.
- [ ] Existing Code actions still work: open workspace, new workspace, add repository, tasks route, automations route, settings route.
- [ ] Add focused regression tests for mode classification/routing/state logic where practical.
- [ ] Add desktop acceptance coverage that verifies the real app can switch between Code, Chat, and the deferred Work tab without blank screens.

## Likely Out Of Scope

- Implementing the full Work/A2A multi-agent collaboration surface.
- Replacing the existing V2 pane system.
- Rewriting the chat backend or Mastra/Mastracode runtime.
- Removing Workspaces/Tasks/Automations as reachable Code-mode surfaces.

## Open Questions

- Resolved: Chat mode MVP is workspace-scoped, not a global account-level chat home.
