# Implementation Plan: Chat / Code / Work Mode Tabs

## Checklist

1. Routing utilities
   - Add a small dashboard mode model, for example `DashboardMode = "chat" | "code" | "work"`.
   - Add route classification/navigation helpers near `DashboardSidebar`.
   - Add focused tests for mode detection and target resolution.

2. Workspace nested mode routes
   - Update `v2-workspace/layout.tsx` to fuzzy-match `/v2-workspace/$workspaceId` descendants.
   - Add `/v2-workspace/$workspaceId/chat` route.
   - Add `/v2-workspace/$workspaceId/work` route.
   - Add dashboard-level `/chat` and `/work` routes for no-active-workspace states.
   - Run `bun run --cwd apps/desktop generate:routes`.

3. Mode-aware left sidebar
   - Extract the current Code sidebar body with minimal behavior changes.
   - Add `DashboardModeSwitcher` with expanded and collapsed variants.
   - Add `DashboardChatSidebar` using `collections.chatSessions` and route navigation.
   - Add `DashboardWorkSidebar` placeholder.
   - Keep settings/help/ports/setup-script behavior scoped appropriately to Code unless a mode explicitly needs it.

4. Chat mode main panel
   - Reuse existing V2 `ChatPane` or `WorkspaceChatInterface` full height.
   - Store the selected chat session in route search (`chatSessionId`).
   - Ensure New Chat clears the search session id and creates a session on send through existing code.
   - Keep model/MCP/upload/slash-command behavior unchanged.

5. Work placeholder
   - Render a restrained placeholder that clearly marks Work as deferred.
   - Do not implement A2A/multi-agent collaboration in this task.

6. Validation and polish
   - Add/adjust focused tests.
   - Run formatting/lint/type checks.
   - Run Desktop Automation CLI acceptance and save screenshots/reports.
   - Update task validation notes.

## Validation Commands

Focused first:

```bash
bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar
bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace
bun run --cwd apps/desktop generate:routes
```

Repo-level:

```bash
bun run lint:fix
bun run lint
bun run typecheck
git diff --check
python3 ./.trellis/scripts/task.py validate 05-31-chat-code-work-mode-tabs
```

Desktop acceptance:

```bash
./.superset/setup.local.sh
bun run --cwd apps/desktop dev
bun run desktop:automation -- smoke --url-includes "#/sign-in" --screenshot .trellis/tasks/05-31-chat-code-work-mode-tabs/artifacts/01-sign-in.png --report .trellis/tasks/05-31-chat-code-work-mode-tabs/artifacts/01-sign-in.json
```

Then drive the real app through:

- sign in/sign up
- open/create workspace
- switch Code -> Chat
- switch Chat -> Work
- switch Work -> Code
- capture screenshots and reports for each checkpoint

## Risky Files / Rollback Points

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`
  - Shell-level changes can blank the dashboard if mode routing is wrong.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`
  - Existing Code navigation must remain intact.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`
  - Current Workspaces/Automations/Tasks/New Workspace actions should not regress.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/layout.tsx`
  - Fuzzy route matching must still handle create/not-found/offline states correctly.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
  - Avoid unnecessary churn in the existing Code surface.

Rollback strategy:

- If Chat route integration becomes unstable, keep the mode switch and Work placeholder, but make Chat route open a new chat pane inside Code mode as a fallback.
- If nested route matching breaks workspace provider state, back out nested Chat/Work routes and use a route search param on `/v2-workspace/$workspaceId/` instead.

## Review Gates

- Mode switch exists in expanded and collapsed sidebar.
- Code mode still behaves like the current app.
- Chat mode uses existing runtime and does not introduce new backend state.
- Work tab is visible but clearly deferred.
- Real desktop smoke proves no blank screens across all three modes.

