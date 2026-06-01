# Implementation Plan

## Scope Strategy

Treat this task as the parent plan for Superset's Task/Code/Work backbone.

Recommended first implementation target: `Task Core`. It should make Tasks local-first and strong enough to become the canonical work item. Full Work, A2A collaboration, and workflow templates should be separate child tasks so each deliverable can be verified independently.

Do not implement a second task identity for Code or Work. Future child tasks must attach to the same Task records.

## Phase 1: Local-first Task tab

- Remove the Tasks tab Linear CTA gate.
- Keep Linear integration entry points optional, likely as an integration/settings affordance rather than a blocker.
- Add tests around `TasksView` rendering Tasks without a Linear connection.

## Phase 2: Task board/list cleanup

- Audit `TasksBoardView`, `TasksTableView`, and shared task filtering.
- Ensure board/list use the same filtered dataset.
- Improve card metadata display using existing persisted fields: slug, title, priority, assignee, labels, due date.
- Add project filtering once the task project field exists.
- Keep drag/drop status update stable and covered by tests.

## Phase 3: Task V2 project association

- Add nullable task V2 project field in Drizzle schema.
- Validate project ownership in `task.create` and `task.update`.
- Add project filter support in task list/live query path.
- Keep existing rows projectless.
- Follow repo migration rules; do not manually edit generated Drizzle migration output.

## Phase 4: Rich create modal

- Expand `CreateTaskDialog` fields:
  - title
  - markdown description
  - status
  - priority
  - assignee
  - due date
  - labels
  - project
- Add local draft state while the modal is open.
- Support seeded status when opened from a board column if that UI is added.
- Add unit/component tests for create payloads and reset behavior.

## Phase 5: AI-assisted task draft

- Locate the preferred model-provider service API from the model configuration center.
- Add a strict zod schema for generated task drafts.
- Implement draft generation as a non-destructive form-fill action.
- Fail soft when model provider is missing or returns invalid JSON.
- Add tests for parser/validation and UI fallback.
- Keep this in MVP per product decision; do not implement Multica-style direct background auto-create yet.

## Phase 6: V2 workspace integration regression pass

- Verify `OpenInWorkspaceV2` still works from task detail.
- Verify batch `RunInWorkspacePopoverV2` still works from selected tasks.
- Keep generated task prompt stable: slug/title plus description.
- Confirm V2 workspace creation keeps a `taskId` link and does not invent a Code-only task concept.

## Phase 7: Work architecture reservation

- Document the intended follow-up boundaries in code comments or docs only where useful:
  - task-bound activity/events
  - artifacts
  - comments/threads
  - workflow template id
  - steps/gates/verifications
  - agent runs/reviews
- Avoid adding UI or schema abstractions that assume Tasks are only Linear mirrors.
- Avoid hard-coding Trellis as a universal process. Any Trellis-inspired naming should be contained to a future `software_delivery` workflow template.
- If implementing any minimal placeholder, keep it inert and explicit: Work is planned, not a partially working hidden feature.

## Phase 8: Quality gate

- `bun run lint:fix`
- `bun run lint`
- Targeted unit tests for changed task components/router utilities.
- Desktop smoke with E2E workspace account:
  - login
  - open Tasks
  - create local task
  - switch board/list
  - open task detail
  - verify V2 workspace launch controls are reachable

## Risky Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/CreateTaskDialog/CreateTaskDialog.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksBoardView/*`
- `packages/trpc/src/router/task/task.ts`
- `packages/trpc/src/router/task/schema.ts`

## Recommended Child Tasks

### Child 1: Task Core

- Local-first Tasks without Linear gate.
- Rich create/edit/detail.
- V2 project association.
- AI draft creation.
- Board/list filtering and smoke tests.

### Child 2: Task Activity Foundation

- Append-only task events.
- Comments/activity timeline.
- Artifacts and evidence.
- Shared read model for Task detail, Code, and Work.

### Child 3: Code Task Bridge

- Workspace creation/run/review writes task activity.
- Terminal/agent run metadata attaches to tasks.
- Diff/review/verification outputs become task artifacts.

### Child 4: Work V0

- Task-bound room/thread surface.
- Human and agent participants.
- Activity feed plus message-to-task/event actions.
- A2A routing skeleton inspired by Zano.

### Child 5: Workflow Template Engine

- Generic template model: phases, steps, roles, prompts, gates, evidence, review policy.
- Trellis-inspired software delivery template as first built-in template.
- Non-development template support by design, for support/sales/ops/content/research.

## Follow-up Candidates

- Full comments/timeline.
- Subtasks/parent tasks.
- Normalized labels.
- Agent/squad assignees.
- Async background quick-create using V2 Work agents.
- PR auto-linking into task detail.
- Domain template marketplace/library for Work.
- Work analytics: cycle time, blocked time, agent contribution, verification pass rate.
