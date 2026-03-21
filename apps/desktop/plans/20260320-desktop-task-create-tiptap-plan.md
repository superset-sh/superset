# Desktop Task Create: Linear-Style TipTap Plan

## Goal

Add a desktop-only create-task flow in the Tasks view that feels like Linear and uses the same editor surface as task editing.

## Scope

- Desktop only
- No web work
- No package extraction unless it becomes necessary later

## Key Decision

Create and edit should share one desktop task composer. Do not build a separate create modal with a second editor implementation.

## Existing Anchors

- Current task editor: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskMarkdownRenderer/TaskMarkdownRenderer.tsx`
- Bubble toolbar: `apps/desktop/src/renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer/components/BubbleMenuToolbar/BubbleMenuToolbar.tsx`
- Tasks top bar entry point: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`
- Existing metadata patterns:
  - status: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/PropertiesSidebar/components/StatusProperty/StatusProperty.tsx`
  - priority: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityMenuItems.tsx`
  - assignee: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/AssigneeFilter/AssigneeFilter.tsx`

## Plan

1. Extract a shared desktop `TaskComposer` under the desktop tasks feature.
   Start from the current `TaskMarkdownRenderer`, bubble menu, and existing metadata controls.

2. Migrate the existing task detail editor to `TaskComposer` in `edit` mode.
   This keeps behavior aligned before adding create.

3. Add a `CreateTaskDialog` launched from `TasksTopBar`.
   The dialog should be compact and Linear-style: title first, metadata row, TipTap description, submit via `Cmd/Ctrl+Enter`.

4. Add a desktop-facing create path that owns slug/default status resolution.
   Do not change the existing low-level `task.create` contract in place if desktop/mobile sync depends on it.

5. On successful create, close the dialog, refresh task data, and navigate to the new task.

## Non-Goals for V1

- Web create flow
- Slash commands
- Image handling
- Full editor/package sharing outside the desktop task feature

## Validation

```bash
bun run typecheck
bun run lint
```

Manual checks:

1. Create a task from the tasks top bar.
2. Edit an existing task with the refactored composer.
3. Confirm create and edit feel like the same surface.
