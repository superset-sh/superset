# Code Map

## Shell And Left Sidebar

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`
  - Mounts the dashboard shell.
  - Owns left sidebar visibility/collapse state through `useWorkspaceSidebarStore`.
  - Mounts `DashboardSidebar` inside `ResizablePanel`.
  - Keeps `TopBar`, `Outlet`, and the right-sidebar portal slot.

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`
  - Current global left sidebar.
  - Renders `DashboardSidebarHeader`, sortable project/workspace tree, ports, setup script, settings/help footer.

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`
  - Current top of the left sidebar.
  - Owns Workspaces, Automations, Tasks & PRs, New Workspace, Add repository.
  - Has both expanded and collapsed render paths.

- `apps/desktop/src/renderer/stores/workspace-sidebar-state.ts`
  - Persisted left sidebar open/collapsed/width state.
  - Good candidate for storing a lightweight app mode only if app mode should be independent of URL.

## Code Mode

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
  - Current V2 workspace "Code" surface.
  - Uses `@superset/panes` `Workspace` for tabs/panes.
  - Can add terminal, chat, browser panes.
  - Uses a right-sidebar portal for Files/Changes/Review.

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces/...`
  - Current V2 workspaces list route.
  - Should remain part of Code mode.

## Chat Runtime

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/ChatPane.tsx`
  - V2 chat pane wrapper.
  - Creates/gets chat sessions through `useWorkspaceChatController`.
  - Renders `WorkspaceChatInterface`.

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/WorkspaceChatInterface/ChatPaneInterface.tsx`
  - V2 chat UI implementation.
  - Uses `workspaceTrpc`, `@superset/chat`, `useChatPreferencesStore`, uploads, slash commands, MCP controls, model picker.

- `packages/chat/src/server/...` and `packages/host-service/src/runtime/chat/chat.ts`
  - Existing Mastra/Mastracode-backed chat runtime.
  - This task should reuse it, not create a new runtime.

## Mastra/Mastracode Facts

- `packages/shared/src/builtin-terminal-agents.ts` includes `mastracode`.
- `apps/desktop/package.json`, `packages/chat/package.json`, and `packages/host-service/package.json` already depend on Mastra/Mastracode packages.
- Agent setup supports Mastracode wrappers and hooks under `apps/desktop/src/main/lib/agent-setup`.

## Initial Design Implication

The safest first cut is to add an app-mode shell above the existing Code sidebar and route behavior:

- `Code` maps to current dashboard/workspace/workspaces/task/automation behavior.
- `Chat` should reuse the V2 workspace chat interface, but needs a product decision:
  workspace-scoped chat home versus global account-level chat home.
- `Work` should render a non-broken deferred panel or disabled/coming-soon affordance.

