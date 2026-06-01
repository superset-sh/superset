# Design

## Architecture

The feature should keep Superset's existing task domain and evolve the desktop Task UI around it. The broader product architecture is a shared Task backbone with three operating surfaces:

- `Chat`: free-form conversation, optionally promoted into or attached to a task.
- `Code`: execution cockpit for a task, including workspace, worktree, terminal, agent CLI, diff/review, and model settings.
- `Work`: collaboration and workflow cockpit for a task, including human/agent conversation, activity, process templates, gates, evidence, and approvals.

The important invariant: `Code` and `Work` do not own separate task records. They both operate on the same canonical task id and append structured activity/artifacts to that task.

- Data source: existing `tasks` and `task_statuses` collections plus `task` tRPC router.
- Local task storage: existing nullable external-provider fields remain the local-first mechanism.
- Optional provider sync: existing Linear sync remains best-effort and provider-driven.
- Execution: existing `OpenInWorkspaceV2` and `RunInWorkspacePopoverV2` remain the bridge from task to V2 workspace.
- AI assist: new draft-generation API/hook should produce structured draft data and feed the create modal; final persistence still uses `task.create`.
- MVP includes AI assist as editable draft generation, not background auto-create.
- Project association: add a nullable V2 project reference to tasks so local tasks can belong to a project and project filtering works for Tasks, not just PRs/Issues or V2 workspace launch.
- Work foundation: avoid schema/UI decisions that would prevent adding task comments, events, artifacts, workflow steps, verifications, agent runs, reviews, and task-bound channels later.
- Workflow templates: treat Trellis as one software-delivery template, not as a hard-coded global workflow.

## Boundaries

- Do not rename DB `tasks` to `issues` in this iteration.
- Do not remove PR and GitHub Issues tabs.
- Do not introduce Multica's Go daemon/CLI queue architecture.
- Do not introduce Zano's full Supabase/Omni runtime architecture in this iteration.
- Do not add a full normalized label/project/sub-issue schema unless explicitly scoped.
- Do add the minimal task-to-project association scoped for MVP.
- Do not block local task creation on Linear, GitHub, host service, or model provider availability.
- Do not create separate Code Task and Work Task tables.
- Do not make Trellis the only Work process. Development teams can use a Trellis-inspired template, but business/support/customer workflows need their own templates.

## Product Boundary Model

| Surface | Owns | Reads/Writes |
| --- | --- | --- |
| Chat | General conversation and discovery | Can promote a message into a Task or attach messages to a Task |
| Task | Canonical work item | Status, priority, assignee, project, labels, description, acceptance, links |
| Code | Execution environment | Reads Task, creates workspace/session, appends artifacts/events/reviews |
| Work | Collaboration and process | Reads Task, hosts participants/messages/steps, appends events/evidence/decisions |

The user should never wonder whether the "Code task" and the "Work task" are two different things. They are the same task viewed through different tools.

## Data Flow

### Local Task Creation

1. User opens create modal from Tasks top bar or board column.
2. User fills manual fields or asks AI to generate a draft.
3. User optionally selects a project.
4. Create modal submits `task.create`.
5. Backend validates active organization membership, status ownership, assignee ownership, and project ownership when provided.
6. Backend inserts `tasks` row with nullable external fields and nullable V2 project reference.
7. Backend may call `syncTask`, but local persistence is already complete.
8. UI navigates to task detail.

### AI Draft

1. User types rough intent into AI-assist panel.
2. Client calls a new task-draft endpoint or existing model-provider service wrapper.
3. Service returns strict JSON:
   - `title`
   - `description`
   - `priority`
   - `labels`
   - optional `dueDate`
   - optional confidence notes/errors
4. Client validates JSON with zod.
5. Valid fields populate the manual create form.
6. User reviews and submits through `task.create`.
7. If generation fails or no model provider is configured, the modal keeps all manually entered content and surfaces a recoverable error.

### V2 Workspace Launch

1. User clicks task detail `Open in workspace` or batch `Run in Workspace`.
2. Existing V2 project/host/agent picker validates host and project availability.
3. Workspace snapshot is created with `taskId`, derived branch, and generated prompt.
4. Navigation moves to `/v2-workspace/$workspaceId`.
5. Follow-up Work/Code phases should append workspace creation, agent run, diff, review, verification, and completion events to the same Task history.

### Future Work Collaboration

1. User opens a Task in Work.
2. Work resolves the task's collaboration space: task room, task thread, or project channel plus task thread.
3. Humans and agents participate in messages and threads.
4. A2A routing classifies message intent, activation reason, strength, topic key, and loop constraints before waking agents.
5. Agent work produces task events, artifacts, verifications, and reviews.
6. Code can be opened from Work for hands-on execution, and Code writes back to the same Task.

### Future Workflow Template

1. Task receives a workflow template id, for example `software_delivery_trellis`, `support_case`, `sales_follow_up`, or `content_production`.
2. Template expands into phases, steps, expected artifacts, assignee roles, prompts, and gates.
3. Work renders the process visually and lets the user or agents advance steps.
4. Domain-specific prompts and checks are template-owned. The workflow engine stays generic.

## UI Design

### Tasks Top Bar

- Keep type tabs: Tasks, PRs, Issues.
- For Tasks, remove Linear CTA and show task controls immediately.
- Keep project selector if it remains meaningful for workspace launch/filter context.
- Add richer task filters incrementally:
  - status
  - priority
  - assignee
  - labels

### Board

- Keep status columns.
- Use stable column width and horizontal overflow.
- Add per-column create buttons later if create modal can accept seeded status.
- Keep drag/drop status update; position sorting can be phase 2 if schema support is insufficient.

### Create Modal

- Inspired by Multica's modal but adapted to Superset UI:
  - compact header with org/workspace context
  - title editor
  - markdown description
  - pill-style properties
  - manual mode as the default reliable path
  - AI assist as a draft generator, not direct auto-create

### Future Work Surface

- Work should feel like a command center for a task, not another generic chat tab.
- The first viewport should make the task, current phase, participants, recent activity, and next action obvious.
- Conversation should be task-aware: messages can become decisions, blockers, review requests, verification evidence, or subtasks.
- Agent collaboration should use Zano-like A2A loop controls so agents do useful work without noisy self-triggering.
- Workflow visualization should be template-driven. A Trellis-like software delivery template can show PRD, design, implementation, checks, spec update, commit, and finish gates. Non-development templates should use the same engine with different labels, prompts, and evidence.

## Compatibility

- Existing local tasks remain valid.
- Existing Linear-imported tasks remain valid.
- Existing `task_statuses` rows from Linear can still appear as board columns.
- Existing V2 workspace task linkage remains valid through `v2Workspaces.taskId`.
- Existing tasks without project remain valid and render as unassigned/no project.
- Future Work data should reference existing task ids and organization/project ownership instead of requiring task migration into a separate domain.

## Migration Notes

- Add a nullable `v2ProjectId`/`v2_project_id` field to `tasks` referencing `v2Projects` / `v2_projects`, which is the table used by the desktop V2 project picker.
- Existing rows should remain `NULL`.
- Follow repo database rules: modify Drizzle schema only, then generate migration through the prescribed Drizzle workflow; do not hand-edit generated migration files.
- Later Work phases may add normalized task activity tables. This task should not add them unless the implementation scope is explicitly expanded beyond Task Core.

## Rollback

- Linear gate removal can be reverted independently in `TasksView.tsx`.
- Create-modal expansion should be isolated under `CreateTaskDialog`.
- AI draft endpoint/hook should be optional; if removed, manual create still works.
- Work/Trellis architecture notes are non-runtime planning constraints until a Work child task starts.

## Trade-offs

- Synchronous AI draft generation is simpler than Multica's agent quick-create queue and fits current Superset architecture better.
- Full agent/squad assignees would be more Multica-like, but they require a stronger actor model and should wait until Work/Agent collaboration is designed.
- Keeping `Task` wording avoids a broad rename now, even though Multica's `Issue` naming is more precise.
- A generic workflow template engine is more work than hard-coding Trellis, but it prevents Superset from becoming development-only and keeps Work viable for business, support, operations, and other teams.
- Starting with Task Core is less visually impressive than building Work immediately, but it creates the durable object model that Work and Code both need.
