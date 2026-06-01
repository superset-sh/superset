# Task Core

## Goal

Implement the first child of the Task/Code/Work backbone: make Superset Tasks local-first, useful without Linear, rich enough to become the canonical work item, and still connected to Code/V2 workspace execution.

This child deliberately does not build the full Work surface. It reserves the architecture so Work can later attach collaboration, A2A, workflow templates, evidence, and reviews to the same Task records.

Work must stay workflow-neutral. Trellis is an excellent software-delivery template for developer tasks, but it must not become the primary Work flow because future customers can be business, support, operations, sales, or other non-R&D teams whose work does not naturally fit PRD/design/implement/check phases.

## Parent Context

- Parent task: `.trellis/tasks/05-31-multica-inspired-task-system`
- Product decision: one canonical Task object shared by Tasks, Code, and future Work.
- First delivery scope selected by the user: `Task Core` first, Work architecture reserved for later child tasks.
- Trellis is a future software-delivery workflow template, not the universal Work process.

## Requirements

### Local-first Tasks

- Remove the Linear-required gate from the Tasks tab.
- Tasks must load and be usable with no Linear connection.
- Keep Linear as an optional integration. Existing Linear-synced tasks should still render and update.
- Keep PR and GitHub Issue tabs separate.

### Task Creation

- Expand `CreateTaskDialog` so manual creation can set:
  - title
  - markdown description
  - status
  - priority
  - assignee
  - due date
  - labels
  - V2 project
- Preserve modal draft state while the dialog is open.
- Reset draft state only after close/create, without losing user-entered text on failed create.
- Navigate to the created task detail after successful create.

### Task Project Association

- Add nullable V2 project association to Tasks.
- Existing tasks may remain projectless.
- Task create/update must validate that the selected project belongs to the task organization.
- Task list/board filters can filter local tasks by project.
- Task detail can show and edit the associated project.
- Follow repo migration rules: modify Drizzle schema only and do not hand-edit generated migration files.

### Board/List UX

- Board and list must share search/filter semantics.
- Board drag/drop status updates must remain optimistic and stable.
- Task cards/rows should show useful metadata without visual clutter: slug, title, priority, assignee, labels, due date, and project when available.
- Project selection must not hide all tasks by forcing a default project when a task is unassigned. Users need a way to see all/projectless tasks.

### AI Draft Creation

- Add an AI-assisted draft path:
  - user enters rough natural language
  - model returns structured draft fields
  - user can edit before final create
- Reuse the model-provider center rather than hardcoding OpenAI/Anthropic.
- Fail soft: if generation fails or no provider exists, manual creation still works and existing draft text remains.
- Validate model output with a strict schema before filling the form.

### Code Integration

- Existing task detail and batch actions must still launch V2 workspaces from selected tasks.
- V2 workspace launch must keep using the same task id.
- Do not introduce a Code-only task concept.

### Work Reservation

- Do not implement full Work, channels, A2A, comments, timeline, or workflow templates in this child.
- Do not introduce abstractions that assume Tasks are only Linear mirrors.
- Keep naming/data shape compatible with future task activity, artifacts, agent runs, reviews, and workflow templates.
- Keep Work compatible with multiple workflow templates. Trellis can be one first-class software engineering template, not the default or mandatory Work process.

## Acceptance Criteria

- [ ] Tasks tab renders controls and task content with no Linear connection.
- [ ] No Linear CTA blocks local Tasks.
- [ ] Local task creation works with title, description, status, priority, assignee, due date, labels, and optional V2 project.
- [ ] Failed task creation preserves the user's draft.
- [ ] Created task navigates to task detail and appears in board/list data.
- [ ] Existing Linear-synced tasks still render.
- [ ] Task create/update validates status, assignee, and project ownership.
- [ ] Existing tasks without project remain visible.
- [ ] Project filter supports all/projectless/project-specific task visibility.
- [ ] Task detail shows and can update the task project.
- [ ] Board and list share search/filter behavior.
- [ ] Board drag/drop status updates still work.
- [ ] AI-assisted creation produces an editable draft through configured model providers and handles invalid/missing provider cases gracefully.
- [ ] V2 workspace launch controls remain reachable from task detail and selected tasks.
- [ ] Unit/component tests cover Linear gate removal, create payloads, project filtering, project validation, AI draft validation, and failed-create draft preservation.
- [ ] Desktop smoke covers login, open Tasks, create local task, switch board/list, open detail, and reach V2 workspace launch controls.

## Out Of Scope

- Full Work room/channel/thread UI.
- Zano-style A2A routing.
- Trellis front-end workflow template execution.
- Task comments/timeline/activity tables.
- Agent/squad polymorphic assignees.
- Normalized labels.
- Subtasks/dependencies.
- Deep Linear project/label two-way sync.

## Notes

- Current backend already persists local-only tasks because external provider fields are nullable and `task.create` writes before optional sync.
- Current `TasksView.tsx` has the Linear gate via `showLinearCTA`.
- Current `CreateTaskDialog.tsx` exposes title, description, status, priority, and assignee only.
- Current task schema lacks a direct `v2ProjectId`.
