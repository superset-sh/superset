# Implementation Plan

## Phase 1: Pre-development Context

- Load desktop/db/trpc Trellis specs with `trellis-before-dev`.
- Re-read parent artifacts:
  - `.trellis/tasks/05-31-multica-inspired-task-system/prd.md`
  - `.trellis/tasks/05-31-multica-inspired-task-system/design.md`
  - `.trellis/tasks/05-31-multica-inspired-task-system/research/multica-issue-system.md`
  - `.trellis/tasks/05-31-multica-inspired-task-system/research/zano-work-a2a-system.md`
  - `.trellis/tasks/05-31-multica-inspired-task-system/research/trellis-workflow-productization.md`
- Confirm no unrelated dirty changes are touched.
- Preserve the Work product boundary: Trellis is a future software-delivery workflow template, not Work's mandatory primary flow.

## Phase 2: Schema and API

- Add `tasks.v2ProjectId` to Drizzle schema with nullable `v2_project_id` reference to `v2Projects.id`.
- Add task/project relation in `packages/db/src/schema/relations.ts`.
- Extend task zod schemas for create/update/list project fields.
- Add project ownership validation helper in task router.
- Update `task.create` and `task.update` to persist/clear project.
- Update `task.list` to filter all/projectless/project-specific tasks.
- Update existing task router tests and add project validation tests.
- Do not manually edit generated Drizzle migrations.

## Phase 3: Remove Linear Gate

- Update `TasksView.tsx` so Tasks render without Linear.
- Keep PRs/Issues unaffected.
- Decide whether `LinearCTA` remains available as an optional integration prompt elsewhere or is unused.
- Add/adjust renderer tests for no-Linear local task rendering.

## Phase 4: Project Filter Behavior

- Stop forcing the first V2 project as the Tasks default filter.
- Add explicit project filter semantics:
  - all
  - projectless
  - specific project
- Wire project filter to board/list data consistently.
- Preserve route search compatibility where practical.

## Phase 5: Rich Create Dialog

- Add due date, labels, and V2 project controls.
- Include new fields in `task.create` payload.
- Preserve draft state while open and on failed create.
- Reset only after successful create or intentional close.
- Navigate to created task detail.
- Add tests for create payloads and failed-create draft behavior.

## Phase 6: AI Draft Creation

- Locate model-provider center APIs from the previous model configuration work.
- Add a task draft zod schema and parser utility.
- Add API/hook for draft generation.
- Add AI assist UI to `CreateTaskDialog`.
- Populate editable fields only after validation.
- Fail soft without losing manual draft.
- Add parser and UI fallback tests.

## Phase 7: Task Detail and Code Bridge

- Add project display/edit control to task detail properties.
- Ensure update payload can set/clear project.
- Verify `OpenInWorkspaceV2` still resolves projects and task id correctly.
- Verify batch `RunInWorkspacePopoverV2` remains reachable.
- Do not introduce a Code-only task identity.
- Do not introduce Trellis-specific Task fields or Work assumptions in this child.

## Phase 8: Validation

- `bun run lint:fix`
- `bun run lint`
- Targeted backend tests:
  - `packages/trpc/src/router/task/task.test.ts`
- Targeted renderer tests for changed components.
- Desktop automation smoke:
  - login with E2E account
  - open Tasks without Linear requirement
  - create local task with project
  - switch board/list
  - open detail
  - reach V2 workspace launch controls

## Risky Files

- `packages/db/src/schema/schema.ts`
- `packages/db/src/schema/relations.ts`
- `packages/trpc/src/router/task/schema.ts`
- `packages/trpc/src/router/task/task.ts`
- `packages/trpc/src/router/task/task.test.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/PropertiesSidebar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/OpenInWorkspaceV2/OpenInWorkspaceV2.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopoverV2/RunInWorkspacePopoverV2.tsx`

## Rollback Points

- If AI draft generation becomes too broad, ship manual Task Core first and leave AI draft behind a disabled UI branch.
- If task project association requires generated migrations that cannot be produced safely in-session, stop after schema/API planning and ask the user to run Drizzle generate.
- If project filtering becomes tangled with existing V2 workspace launch project filter, keep UI filtering to all/projectless/project-specific and defer deeper route-state cleanup.
