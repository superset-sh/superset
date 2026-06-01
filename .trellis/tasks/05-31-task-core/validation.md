# Validation Notes

## 2026-05-31

Passed:

- `bun test packages/host-service/src/trpc/router/model-providers/task-draft.test.ts packages/trpc/src/router/task/task.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TableContent/utils/getSelectedTasks/getSelectedTasks.test.ts`
- `bun test packages/host-service/src/trpc/router/model-providers/model-providers.test.ts`
- `bun run --cwd packages/host-service typecheck`
- `bun run --cwd packages/trpc typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run typecheck`
- `bun run lint`
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/05-31-task-core`
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/05-31-multica-inspired-task-system`
- `bun run desktop:automation -- smoke --url-includes "#/tasks" --screenshot .trellis/tasks/05-31-task-core/artifacts/tasks-smoke.png --report .trellis/tasks/05-31-task-core/artifacts/tasks-smoke.json`

Generated migration:

- `packages/db/drizzle/0057_add_task_v2_project_id.sql`

Desktop smoke notes:

- Smoke verified the real Electron window at `http://localhost:3005/#/tasks`.
- Screenshot artifact: `.trellis/tasks/05-31-task-core/artifacts/tasks-smoke.png`
- Report artifact: `.trellis/tasks/05-31-task-core/artifacts/tasks-smoke.json`
- Full create/open-detail smoke was not run in this pass because the active visible app session is the developer's daily account. Avoid creating extra task data there unless explicitly requested or a disposable E2E login flow is used and then restored.

## 2026-06-01 New Task Acceptance Fixes

Passed:

- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint:fix`
- `bun run lint`

Desktop acceptance:

- Verified the real Electron window at `http://localhost:3005/#/tasks`.
- Opened New Task dialog through Desktop Automation CLI.
- Confirmed the separate rough AI prompt box is gone and `AI polish` is available from the dialog header.
- Confirmed the dormant attachment button/error path is gone from the dialog.
- Opened the custom due-date calendar popover and used `Today`; the dialog updated to `Jun 1, 2026`.
- Renderer `console-logs --level error` returned `[]` after the dialog/date-picker checks.
- Screenshot artifacts:
  - `.trellis/tasks/05-31-task-core/artifacts/new-task-dialog-final.png`
  - `.trellis/tasks/05-31-task-core/artifacts/new-task-date-picker.png`

Notes:

- Did not create a new task in the visible daily account during this UI feedback pass to avoid adding extra user data. The create payload wiring remains covered by the source regression test and the earlier Task Core validation pass.

## 2026-06-01 Task Create Regression

Root cause:

- A real local create failed because the local PostgreSQL database had not applied the generated `tasks.v2_project_id` migration.
- The previous desktop acceptance was too shallow: it proved `/tasks` and the New Task dialog rendered, but it intentionally skipped real create/detail in the visible daily account. That left the DB schema/runtime path untested.

Fix:

- Applied local migrations with `bun run --cwd packages/db migrate`.
- Probed the local DB shape and confirmed `information_schema.columns` contains `tasks.v2_project_id`.

Regression coverage added:

- `packages/trpc/src/router/task/task.test.ts`
  - creates a minimal local task with seeded status and neutral defaults
  - creates a rich local task with status, assignee, V2 project, due date, labels, high priority, and Chinese-title slug fallback
  - rejects create when status belongs outside the active organization
  - rejects create when assignee belongs outside the active organization
  - rejects create when V2 project belongs outside the active organization
  - keeps project update coverage for same-org and cross-org project cases

Validation passed:

- `bun test packages/trpc/src/router/task/task.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TableContent/utils/getSelectedTasks/getSelectedTasks.test.ts packages/host-service/src/trpc/router/model-providers/task-draft.test.ts`
- `bun run --cwd packages/trpc typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`

Real desktop create E2E:

- Opened the real Electron app at `http://localhost:3005/#/tasks`.
- Created a task through the New Task dialog with Chinese title, markdown description, `High` priority, and custom calendar date `Jun 1, 2026`.
- Verified navigation to `#/tasks/4ce8f31d-7c18-46d7-9b0b-664bbb9625b7`.
- Verified renderer `console-logs --level error` returned `[]`.
- Verified DB row was inserted with title `[E2E] 中文任务创建清理 2026-06-01`, priority `high`, due date `2026-05-31T16:00:00.000Z`, and `v2ProjectId: null`.
- Soft-deleted the E2E row and confirmed the non-deleted query returned `[]`.
- Returned the visible app to `#/tasks`.
- Screenshot artifact: `.trellis/tasks/05-31-task-core/artifacts/task-create-rich-e2e-detail.png`
