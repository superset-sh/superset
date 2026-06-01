# Multica Issue System Research

## Source Scope

Reference clone: `/tmp/multica-source`

Key files inspected:

- `docs/product-overview.md`
- `packages/views/issues/components/issues-page.tsx`
- `packages/views/issues/components/issues-header.tsx`
- `packages/views/issues/components/board-view.tsx`
- `packages/views/issues/components/board-column.tsx`
- `packages/views/issues/components/board-card.tsx`
- `packages/views/issues/components/list-view.tsx`
- `packages/views/issues/components/list-row.tsx`
- `packages/views/modals/create-issue.tsx`
- `packages/views/modals/quick-create-issue.tsx`
- `packages/core/issues/config/status.ts`
- `packages/core/issues/config/priority.ts`
- `packages/core/issues/stores/draft-store.ts`
- `packages/core/issues/stores/quick-create-store.ts`
- `packages/core/issues/stores/create-mode-store.ts`
- `packages/core/issues/stores/view-store.ts`
- `packages/core/issues/mutations.ts`
- `packages/core/issues/queries.ts`
- `packages/core/types/api.ts`
- `packages/core/types/issue.ts`
- `server/internal/handler/issue.go`
- `server/internal/service/task.go`
- `server/internal/daemon/prompt.go`
- `server/pkg/db/queries/issue.sql`

## Product Model

Multica's key modeling decision is:

- `Issue` is the work item: bug/task/feature, visible in the board/list/detail UI.
- `Task` is an agent execution queue item (`agent_task_queue`), usually attached to an issue or created by quick-create.

For Superset this means:

- Superset `tasks` should map to Multica `Issue`.
- Superset V2 workspace/terminal/session should map to Multica agent execution, not be conflated with the task record itself.

## Multica Features Worth Copying

- Local-first issue board independent of Linear.
- Status columns: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`; `cancelled` exists but is hidden from board columns.
- Priority values match Superset: `urgent`, `high`, `medium`, `low`, `none`.
- Board cards show identifier, title, priority, assignee, description preview, project, labels, dates, child progress, and agent activity.
- List view is denser and grouped by status, with collapsible groups and the same drag/drop model.
- View preferences are persisted locally via Zustand.
- Filtering uses positive selections: empty filter means show all; selected status/priority/assignee/project/label narrows results.
- Creation has two modes:
  - Manual create: title, rich description, status, priority, assignee, due date, project, start date, parent/children, attachments.
  - Agent quick-create: user enters rough natural language, picks an agent/squad and project, then an async agent creates the issue.
- Manual and agent creation modes can switch while preserving draft content.
- Quick-create stores last selected actor/project and prompt draft.

## AI Creation Flow

Multica's quick-create path:

1. Frontend posts `{ agent_id | squad_id, prompt, project_id?, parent_issue_id? }` to `/api/issues/quick-create`.
2. Backend validates workspace membership, actor visibility, runtime availability, daemon CLI version, project, and parent issue.
3. Backend enqueues a high-priority `agent_task_queue` row with a `quick_create` JSON context.
4. Daemon sees `QuickCreatePrompt` and builds a prompt telling the agent to run exactly one `multica issue create --output json`.
5. Prompt rules ask the agent to derive title, description, priority, assignee, project, parent, and status without inventing requirements.
6. Completion links the created issue back to the quick-create task and notifies the requester.

Superset should not copy this whole queue on day one. A better MVP is:

- use model-provider center to produce a structured draft synchronously or short async
- show the draft in the manual create form
- let the user submit through existing `task.create`

Later, if Superset adds first-class background agents as assignees, the Multica queue model becomes a stronger fit.

## Superset Current State

Key files inspected:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/TasksBoardView.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/components/KanbanCard/KanbanCard.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/PropertiesSidebar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx`
- `packages/db/src/schema/schema.ts`
- `packages/db/src/seed-default-statuses.ts`
- `packages/trpc/src/router/task/task.ts`
- `packages/trpc/src/router/task/schema.ts`
- `packages/trpc/src/lib/integrations/sync/tasks.ts`

Findings:

- The current UI artificially blocks Tasks behind `LinearCTA`.
- The DB/backend already allow local-only tasks.
- Default statuses are seeded locally: Backlog, Todo, In Progress, Done, Canceled.
- `task.create` seeds a default status if none is provided.
- `syncTask` queues provider sync for configured integration connections; it is not needed for local task persistence.
- Existing V2 workspace launch from a task is valuable and should stay.
- Current task detail is much lighter than Multica: no comments, no rich timeline, no sub-issues, no dependency graph.

## Recommended MVP Mapping

| Multica | Superset MVP |
| --- | --- |
| Issue | Task |
| Issue board/list | Existing Tasks board/table rebuilt/expanded |
| Issue identifier | Existing `task.slug` |
| Project | Existing `v2Projects` / `v2_projects` |
| Member assignee | Existing `users` assignee |
| Agent/squad assignee | Later; possibly V2 agent choice for execution, not DB assignee yet |
| Agent task queue | V2 Workspace create/run/session |
| Quick-create agent | AI draft generation through model-provider center |
| PR links | Existing PR tab and task `prUrl` |
| Comments/timeline | Later |

## Implementation Risks

- The current status model uses external Linear statuses as dynamic rows. Board/list logic must handle both default statuses and Linear-imported statuses.
- Labels are stored as `jsonb string[]`, not normalized. This is enough for MVP chips/filtering but not a full label management system.
- V2 project and Task `organizationId` are separate concepts in current code. Project filtering is already present in the top bar, but Tasks themselves do not currently have a direct `v2ProjectId` column. Product decision: add real V2 project association in MVP, which requires a schema change/migration plan.
- AI-assisted creation should fail soft. If the model provider is missing or errors, manual task creation must still work.
- Drag/drop performance can regress if every card subscribes to too much data. Keep cards memoized and avoid per-card heavy live queries.

## Recommendation

Build in two layers:

1. Local-first task board and rich create/edit, removing Linear as a required dependency.
2. AI-assisted task draft generation that reuses the model-provider center and writes only after user review.
3. Real task-to-project association so the Tasks project filter becomes meaningful.

Do not implement agent/squad polymorphic assignees or full quick-create execution queue in the first pass.
