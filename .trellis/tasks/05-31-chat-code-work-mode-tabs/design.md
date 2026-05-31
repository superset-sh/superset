# Design: Chat / Code / Work Mode Tabs

## Architecture

Add a route-aware dashboard mode shell around the existing V2 dashboard:

- `Code` remains the default mode and keeps the current V2 workspace/workspaces/task/automation behavior.
- `Chat` is a workspace-scoped mode that reuses the existing V2 chat runtime/UI.
- `Work` is a visible deferred mode with a non-broken placeholder.

The active mode should be derived from the current route instead of introducing a new persisted app-mode store. This keeps browser history/deep links meaningful and avoids local schema or migration work.

## Routes

Proposed route map:

- `Code`
  - `/v2-workspaces`
  - `/v2-workspace/$workspaceId/`
  - `/tasks`
  - `/automations`
  - settings and other existing dashboard routes remain reachable.
- `Chat`
  - `/chat` for the no-active-workspace / choose-workspace state.
  - `/v2-workspace/$workspaceId/chat` for the workspace chat surface.
- `Work`
  - `/work` for no-active-workspace placeholder.
  - `/v2-workspace/$workspaceId/work` for workspace-scoped placeholder.

`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx` currently matches only `/v2-workspace/$workspaceId`; it should switch to a fuzzy match so nested `/chat` and `/work` routes share `WorkspaceProvider`, host routing, and create/not-found/offline states.

## Left Sidebar

Refactor `DashboardSidebar` into a mode-aware shell:

- Add `DashboardModeSwitcher` near the top of the left sidebar.
- Keep expanded and collapsed render paths:
  - Expanded: segmented/text+icon mode switch for `Chat`, `Code`, `Work`.
  - Collapsed: icon buttons with tooltips.
- Move the current project/workspace navigation into a `Code` sidebar body without changing its behavior.
- Add a `Chat` sidebar body:
  - Shows active workspace context.
  - Shows `New Chat`.
  - Lists chat sessions for the active workspace using `collections.chatSessions`.
  - Navigates to `/v2-workspace/$workspaceId/chat?chatSessionId=...`.
  - If no workspace is active, shows a choose/create workspace entry and routes to `/chat`.
- Add a `Work` sidebar body:
  - Keeps the `Work` tab visible.
  - Shows a small deferred-state panel, not a blank screen.

`DashboardSidebar` lives above `WorkspaceProvider`, so the Chat sidebar should not call `workspaceTrpc`. It can use TanStack DB collections for session list rendering and route navigation. Runtime actions that need `workspaceTrpc` stay in the main Chat route.

## Main Chat Surface

Create a route-owned `WorkspaceChatModePage` under the V2 workspace route:

- Read `chatSessionId` from route search params.
- Render the existing `ChatPane` / `WorkspaceChatInterface` full height.
- On session creation or selection, update route search with `chatSessionId`.
- Keep model picker, MCP controls, uploads, slash commands, approval/question flows, and Mastra/Mastracode runtime behavior from the existing V2 chat implementation.

For `/chat`, render a lightweight workspace selection state:

- If workspaces exist, show a compact list to open Chat for a workspace.
- If none exist, provide the same create/open workspace path users already know from Code mode.

## Mode Switch Behavior

- From a workspace route:
  - `Code` -> `/v2-workspace/$workspaceId/`
  - `Chat` -> `/v2-workspace/$workspaceId/chat`
  - `Work` -> `/v2-workspace/$workspaceId/work`
- From a non-workspace route:
  - `Code` -> current Code route when already Code, otherwise `/v2-workspaces`.
  - `Chat` -> `/chat`
  - `Work` -> `/work`

This preserves the most important "return to Code" case: switching from a workspace's Chat/Work route back to Code returns to the same workspace.

## Data And Contracts

- Do not add database migrations.
- Do not add a new chat backend or new Mastra runtime.
- Use existing `chatSessions` rows for Chat sidebar session list.
- Use cache-first TanStack DB rendering rules: render existing rows even while collections are not fully ready.
- Do not remove or hide current Code-mode actions; just scope them to Code mode.

## Trade-Offs

- Route-derived mode is more explicit than a persisted Zustand mode, but it means mode selection changes the URL.
- Chat sidebar deletion can be deferred because it would need workspace-scoped runtime cleanup from outside `WorkspaceProvider`; session creation/selection is enough for MVP.
- Switching from Code to Chat unmounts the code pane tree. V2 pane layout is persisted and terminal runtime is durable, so the required acceptance check is that switching back restores the workspace and does not blank or reset the layout.

## Acceptance Strategy

Lower-level checks:

- Pure route/mode resolver tests for `Chat`, `Code`, and `Work` route classification.
- Source or unit tests proving nested workspace mode routes keep `WorkspaceProvider` matching fuzzy workspace IDs.
- Focused tests for Chat session route search handling if extracted into a helper.

Desktop Automation CLI:

- Launch real desktop app with a disposable profile.
- Sign in/sign up using test credentials.
- Open/create a V2 workspace.
- Verify left sidebar mode switch is visible.
- Switch `Code -> Chat`; verify chat surface/input is visible and route is a Chat route.
- Switch `Chat -> Work`; verify Work placeholder is visible and not blank.
- Switch `Work -> Code`; verify the same workspace Code surface returns.
- Capture screenshots/reports under `.trellis/tasks/05-31-chat-code-work-mode-tabs/artifacts/`.

