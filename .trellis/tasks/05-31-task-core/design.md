# Design

## Architecture

This child evolves the existing task domain without introducing a second work item model.

- Data model: extend `tasks` with nullable V2 project association.
- Backend API: extend `task.create`, `task.update`, and `task.list` schemas/handlers.
- Desktop UI: update Tasks tab, create dialog, board/list filters, task detail, and V2 launch regression path.
- AI draft: add a task draft generation wrapper that returns validated structured data and never creates a task directly.
- Code/Work invariant: every execution path continues to reference the canonical task id.
- Work invariant: the task core must not encode Trellis as the universal process. Work later hosts multiple templates and collaboration patterns; Trellis is only one software-delivery template.

## Current Evidence

- `packages/db/src/schema/schema.ts` defines `tasks` without `v2ProjectId`.
- `packages/db/src/schema/schema.ts` defines `v2Projects` as `v2_projects`.
- `packages/db/src/schema/relations.ts` has task relations for organization/status/assignee/creator/workspaces, but no project relation.
- `packages/trpc/src/router/task/schema.ts` supports title, description, status, priority, assignee, estimate, due date, and labels.
- `packages/trpc/src/router/task/task.ts` validates status and assignee ownership and persists local tasks before optional provider sync.
- `TasksView.tsx` currently computes `showLinearCTA` and blocks the Tasks tab when Linear is disconnected.
- `CreateTaskDialog.tsx` exposes only title, description, status, priority, and assignee.
- `TasksView.tsx` currently pushes a default project filter to the URL when projects exist, which can hide projectless tasks if project filtering becomes real for Tasks.

## Data Model

Add a nullable field to `tasks`:

- TS field: `v2ProjectId`
- DB column: `v2_project_id`
- Reference: `v2Projects.id`
- Delete behavior: likely `set null`, so deleting a project does not delete historical tasks.
- Index: `tasks_v2_project_id_idx`

Add Drizzle relation:

- `tasksRelations.project = one(v2Projects, { fields: [tasks.v2ProjectId], references: [v2Projects.id] })`
- `v2ProjectsRelations.tasks = many(tasks)` if a relation section already fits cleanly.

Migration rule:

- Modify schema only.
- Do not manually edit generated migration files.
- Ask the user to run the Drizzle generate command if migration generation is needed.

## API Contracts

Extend schemas:

- `createTaskSchema.v2ProjectId?: uuid | null`
- `updateTaskSchema.v2ProjectId?: uuid | null`
- `taskListInputSchema.v2ProjectId?: uuid | null`
- optional projectless filter shape if the UI needs it, for example `projectMode: "all" | "projectless" | "project"`

Add helper:

- `getScopedV2ProjectId(executor, organizationId, v2ProjectId, message)`
- Returns null for null input.
- Validates `v2Projects.organizationId === organizationId`.

Update create:

- Validate project in the same transaction as status/assignee.
- Insert `v2ProjectId`.

Update update:

- Validate project when `"v2ProjectId" in data`.
- Allow clearing project by passing null.

Update list:

- Filter by project when a specific project id is provided.
- Support all and projectless visibility without requiring a project id.

## UI Flow

### Tasks Tab

- Remove `showLinearCTA` as a blocker for `typeTab === "tasks"`.
- Keep optional Linear integration affordance as non-blocking copy or settings entry if needed.
- Preserve PRs and Issues behavior.

### Project Filtering

- Stop auto-selecting the first V2 project for the Tasks tab.
- Provide explicit project modes:
  - all tasks
  - projectless tasks
  - a specific project
- Existing URL/search state should avoid breaking old URLs.

### Create Dialog

- Keep the current rich modal shape.
- Add fields for due date, labels, and V2 project.
- Use compact property pickers rather than large forms.
- Add AI draft panel/action without making AI the only path.
- Preserve draft on generation failure and create failure.

### Task Detail

- Show project in the properties/sidebar area.
- Allow editing/clearing project.
- Keep existing V2 workspace open controls.

## AI Draft Design

Add a strict draft schema:

- `title: string`
- `description?: string`
- `priority?: TaskPriority`
- `labels?: string[]`
- `dueDate?: ISO date or null`
- optional `confidenceNotes?: string`

Generation should:

- Use the configured model-provider center.
- Instruct the model to return JSON only.
- Validate with zod.
- Fill the form, not persist a task.
- Fail soft with a toast or inline error.

## Work Workflow Design Boundary

The future Work surface should be a general collaboration and execution room for a Task, not a Trellis-only UI. It can show Trellis-like phases when the selected workflow template is software delivery, but other templates may represent support triage, customer onboarding, business operations, research, review queues, or ad-hoc agent rooms.

This child therefore only adds neutral Task metadata and project association. It must avoid field names, UI labels, or storage decisions that imply every Task has Trellis phases, implementation artifacts, or code-review gates.

## Compatibility

- Existing tasks have `v2ProjectId = null`.
- Linear-synced tasks can remain projectless unless manually assigned.
- Optional sync should still run after local create/update.
- V2 workspaces already link to `taskId`; that link remains the Code bridge.

## Rollback

- Linear gate removal can be reverted in `TasksView.tsx`.
- Project association can be isolated to schema/API/UI fields.
- AI draft can be disabled without breaking manual task creation.

## Risks

- Project filtering can accidentally hide all projectless tasks if the current first-project auto-selection remains.
- AI draft output can be malformed; strict validation and soft failure are mandatory.
- Adding task project fields touches DB, tRPC, Electric collections, and UI at once, so tests must cover both API and renderer assumptions.
- Syncing local tasks to Linear may not understand V2 project ids; keep the field local unless provider sync is explicitly mapped.
