# Multica-inspired Task System

## Goal

Rebuild `Task & PR > Tasks` into Superset's own local-first, AI-native work system, then use it as the foundation for the future `Code` and `Work` product surfaces.

The product center is a single durable `Task` record. `Code` and `Work` are different operating surfaces around the same task, not separate task systems.

## User Value

- Treat tasks as the product's own first-class work units instead of a thin Linear mirror.
- Keep the familiar issue-board workflow: board/list views, status, priority, assignee, labels, dates, search, and task detail.
- Let AI help turn rough user intent into a clean task, without forcing the user to manually fill every field.
- Keep `Task -> V2 Workspace -> Code/Agent execution` as the main execution path.
- Establish the product backbone for the future Work surface: task-bound collaboration, agent activity, process templates, evidence, review, and human approval.

## Confirmed Facts

- Current `/tasks` already has `tasks`, `prs`, and `issues` type tabs.
- Current Tasks UI is gated by Linear when no Linear integration is connected: `TasksView.tsx` renders `LinearCTA` for `typeTab === "tasks"`.
- The backend/database already support local-only tasks: `tasks.externalProvider`, `externalId`, `externalKey`, and `externalUrl` are nullable.
- `task.create` creates a local task first, and `syncTask` only attempts provider sync if integration connections exist.
- Existing task creation supports title, description, status, priority, assignee, labels, estimate, and due date at the schema level, though the desktop dialog exposes only part of this.
- Existing task detail supports editable title/description plus status, priority, assignee, labels display, and `Open in workspace`.
- Existing batch task selection can create V2 workspaces from selected tasks.
- Multica's Issue system is local-first and Linear-like: status board/list, priority, assignee, creator, project, labels, due dates, sub-issues, activity/timeline, comments, PR links, and batch actions.
- Multica's AI creation flow is not just text polish. Its quick-create mode queues an agent task that turns natural language into a structured issue creation command.
- Multica separates `Issue` (work item) from `Task` (`agent_task_queue`, one agent execution). In Superset, `Task` should map to Multica `Issue`; execution should map to V2 workspace/terminal/session.
- Zano's core value is persistent human and agent collaboration in channels, DMs, threads, and task threads. Its task model is useful, but the deeper product primitive is the shared collaboration space around a task.
- Zano's A2A protocol classifies conversation spaces, message intent, activation reasons, activation strength, and agent decision modes. This is a strong reference for future Work agent routing and loop control.
- Zano's task schema extensions include comments, artifacts, events, specs, plans, steps, verifications, agent runs, and reviews. Those map well to a future generic Work workflow engine.
- Trellis v0.6 beta is a skill/hook/workflow harness for AI coding tools. Its portable ideas are task PRDs, specs, workflow phases, context injection, quality gates, session journals, and knowledge capture.
- Trellis should not become the Work product's main workflow. It is a software-development workflow template that can be productized inside Work, alongside non-engineering templates for support, sales, operations, research, content, and other teams.

## Requirements

### Product Model

- Maintain one canonical Task object:
  - `Task` = durable work item, status, ownership, metadata, project, acceptance, history.
  - `Code` = task execution cockpit: workspace, worktree, terminal, agent CLI, diff/review, model configuration, generated artifacts.
  - `Work` = task collaboration and process cockpit: human and agent chat, threads, activity, assignments, workflow steps, evidence, review, and approvals.
  - `Chat` = non-task conversation that can be attached to or promoted into a Task.
- Do not create independent "Code tasks" and "Work tasks". Code and Work must reference the same task id and write activity/artifacts back to the same history.
- Treat Multica Issue as a product reference for Task UX, Zano as a product reference for Work collaboration/A2A, and Trellis as a reference workflow template for software delivery.

### Local-first Tasks

- Remove the Linear-required gate for the Tasks tab. Linear can remain an optional integration, but local tasks must be usable without it.
- Keep PRs and GitHub Issues as separate tabs; this task focuses on the Tasks tab.
- Upgrade the Tasks view toward a Multica-like issue board:
  - board/list switch remains
  - richer filters for status, priority, assignee, labels/project when supported by existing data
  - usable horizontal board scrolling and stable drag/drop
  - task cards show key work metadata without becoming visually noisy
- Add real Project association for local Tasks:
  - task creation can assign a V2 project
  - task list/board can filter by project
  - task detail can show/edit project
  - existing tasks may remain unassigned
- Upgrade task creation:
  - manual mode supports title, rich description, status, priority, assignee, due date, labels, and project/workspace context where feasible
  - draft state is preserved while the create modal is open
  - creating a task navigates to the new task detail and keeps local caches/live collections in sync
- Add an AI-assisted creation path:
  - user can type rough natural language
  - AI returns a structured proposal: title, description, priority, labels, possibly assignee/date when confidently inferable
  - user can review/edit before final creation
  - should reuse the model-provider center when available rather than hardcoding a provider
  - this is in MVP, but implemented as editable draft generation rather than direct background auto-create
- Keep V2 execution integration:
  - task detail and selected-task batch actions can still launch V2 workspaces
  - generated prompt uses task title/description/metadata cleanly
- Optional Linear sync remains compatible:
  - imported Linear tasks still appear as tasks
  - local tasks can remain local if no Linear provider is configured
  - Linear disconnect should not destroy local task usability
- Do not copy Multica source verbatim. Use it as product and architecture reference.
- Do not port Zano source verbatim. Use it to inform Work collaboration primitives and A2A routing.
- Do not hard-code Trellis as the only Work process. Model workflows as configurable templates.

### Work Foundation

- Reserve the data and UI vocabulary needed for future Work:
  - task-bound collaboration room/thread
  - task activity feed
  - task artifacts
  - task workflow/template identity
  - task steps/gates/verifications
  - task agent runs/reviews
- The first implementation may expose only the Task/Code-facing parts, but it must not make Work harder to add.
- The first Work template for software delivery may be Trellis-inspired, but the workflow model must support non-development templates.

## Acceptance Criteria

- [ ] Tasks tab loads and is usable with no Linear connection.
- [ ] Creating a task locally works without Linear and does not show a Linear CTA gate.
- [ ] Existing Linear-synced tasks still render and update through the same task views.
- [ ] Board view supports moving tasks between statuses and keeps optimistic updates stable.
- [ ] List view and board view share the same task/filter/search semantics.
- [ ] Create task modal supports at least title, description, status, priority, assignee, due date, and labels if the current schema can persist them.
- [ ] Local tasks can be assigned to a project, filtered by project, and left unassigned.
- [ ] AI-assisted creation can turn a rough prompt into an editable task draft using the configured model provider.
- [ ] Task detail still supports title/description/status/priority/assignee edits.
- [ ] Task detail and batch actions still launch V2 workspaces from tasks.
- [ ] Code execution paths keep writing to the canonical Task rather than creating a separate Code-only task concept.
- [ ] Planning artifacts define the future Work boundary clearly enough that a follow-up Work task can add collaboration/activity/workflow without reworking Task identity.
- [ ] Trellis-inspired workflow concepts are represented as one workflow template family, not as the hard-coded Work process.
- [ ] Unit tests cover task creation/local-only behavior, Linear-gate removal, filtering, and AI draft parsing.
- [ ] Desktop smoke/E2E covers login, workspace selection, opening Tasks, creating a task, switching board/list, and launching or at least reaching the V2 workspace launch controls.

## Out Of Scope For MVP

- Full Multica-style agent/squad/member polymorphic assignees unless Superset already has a compatible agent identity model ready to use.
- Full comments/reactions/timeline system.
- Sub-issues, dependencies, acceptance criteria, Gantt/swimlane views, and inbox notifications.
- Replacing GitHub PR/Issue tabs.
- Deep Linear two-way project/label parity beyond keeping current optional sync working.
- Full Work surface with persistent channels, DMs, task threads, and A2A routing.
- Full Trellis front-end workflow execution UI.
- Domain templates beyond a software-delivery/Trellis-inspired template.
- Full Zano/Omni agent runtime port.

## Recommended Task Split

This is a parent-level product plan. Implement it as independently verifiable child tasks:

1. `Task Core`: local-first Tasks, Linear gate removal, rich create/edit, project association, AI draft creation.
2. `Task Activity Foundation`: comments/events/artifacts and task history primitives used by both Code and Work.
3. `Code Task Bridge`: make Code workspaces, terminal runs, diffs, reviews, and agent runs write structured activity back to the canonical Task.
4. `Work V0`: task-bound collaboration room with humans and agents, basic threads, activity feed, and a placeholder for workflow templates.
5. `Workflow Template Engine`: generic phases/steps/gates/evidence model, with Trellis as the first software-delivery template and non-development templates supported by design.

## Product Decisions

- AI-assisted task creation is in MVP as a non-destructive, editable draft generator.
- Real V2 Project association for local Tasks is in MVP. Existing tasks may remain projectless.
- Canonical Task identity is shared by Code and Work. No duplicate task systems.
- Work is the flagship collaboration/productivity surface, but this current implementation should start with Task Core and reserve the Work architecture cleanly.
- Trellis is a workflow template/reference for software development, not the universal Work workflow.
