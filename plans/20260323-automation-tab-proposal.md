# Automation Tab Proposal

## Summary

This note captures the main lessons worth borrowing from Ramp's "self-maintaining" writeup and maps them onto Superset's current product and codebase.

The important idea is not "generate a thousand monitors." The important idea is a closed-loop automation system:

1. Detect broadly
2. Triage automatically
3. Reproduce in a real sandbox or workspace
4. Propose an action
5. Require human review before merge or rollout

For Superset, that suggests an `Automations` control plane in the web app, with execution happening in desktop workspaces and existing agent flows.

## Main Learnings To Pull Forward

### 1. Detect everything, notify selectively

The system should ingest lots of signals, but it should only notify humans after an automation has:

- deduplicated the event
- gathered context
- decided it is likely real
- ideally reproduced it

Raw alerts are cheap. Human attention is not.

### 2. The agent should do the triage work

The first automation step should not be "notify Slack." It should be:

- is this real?
- is it duplicate noise?
- did we already open a task or PR?
- is the impact high enough to escalate?

This is the highest leverage use of agents in the loop.

### 3. Reproduction should be mandatory for high-confidence escalations

The most useful pattern from the writeup is requiring the agent to reproduce the failure against live code before proposing a fix.

For Superset, this maps naturally to workspaces, task launches, and agent-session orchestration rather than static code inspection.

### 4. Keep the existing observability stack

Generated monitors and automation logic should complement, not replace, trusted instrumentation.

For now, Superset should continue to rely on hand-owned observability and use automations as a higher-level response layer.

### 5. Model choice should be per phase

Triage, reproduction, and patch generation are different jobs. The system should not assume one model or one agent preset is best for all of them.

The product should eventually allow different agent or model selections for:

- triage
- execution
- summary or notification formatting

## Why This Fits Superset

Superset already has most of the primitives needed for this:

- Web control-plane navigation is still small and can absorb a new org-level surface.
- The web app already has integrations for Slack, GitHub, and Linear.
- The web and API apps already initialize Sentry and PostHog.
- The API already processes GitHub webhooks and Slack job endpoints.
- The desktop app already opens tasks into workspaces and launches agents.
- Shared launch types already support both chat and terminal execution.
- Existing task records already have branch and PR metadata.
- Existing `agent_commands` records can act as a basic execution log backbone.

Relevant code paths today:

- `apps/web/src/app/(dashboard)/components/SidebarNav/SidebarNav.tsx`
- `apps/web/src/app/(dashboard)/integrations/page.tsx`
- `apps/web/src/instrumentation-client.ts`
- `apps/api/src/app/api/github/webhook/route.ts`
- `apps/api/src/app/api/integrations/slack/jobs/process-mention/route.ts`
- `packages/shared/src/agent-launch.ts`
- `packages/mcp/src/tools/devices/start-agent-session/start-agent-session.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/TasksTopBar/components/RunInWorkspacePopover/RunInWorkspacePopover.tsx`
- `packages/db/src/schema/schema.ts`

## Proposed Product Shape

### Web: `Automations` Tab

This should be the configuration and review surface.

Suggested sections:

- `Templates`: predefined automation recipes
- `Runs`: recent executions with status and evidence
- `Review Queue`: proposed tasks, workspace launches, and draft fixes awaiting human approval
- `Noise Controls`: suppression, snooze, dedupe windows, and escalation thresholds
- `Coverage`: what repos, projects, or product areas are covered by automations

Each automation should be defined as:

- trigger
- context gatherers
- triage step
- reproduction step
- action policy
- notification policy

### Desktop: Execution Surface

Desktop should stay responsible for:

- creating or reusing workspaces
- launching agents
- running tests and commands
- validating reproduction and candidate fixes

That keeps the control plane lightweight and keeps real execution in the environment users already trust.

## Best V1 Automations

Start with narrow, high-signal automations that sit on top of existing integrations.

### 1. GitHub Merge Audit

Trigger:

- PR merged

Flow:

- read diff
- identify impacted files or areas
- run a focused QA or regression pass
- create a task or draft fix if something breaks

Why first:

- high signal
- already event-driven
- avoids the "whole-repo nightly wandering agent" problem

### 2. Sentry Regression Triage

Trigger:

- new issue spike or error class regression

Flow:

- collect stack, route, release context, and affected user/session metadata
- attempt repro in workspace
- if reproducible, create task or propose fix
- if not reproducible after repeated attempts, suppress or downgrade

### 3. Slack Bug Intake Automation

Trigger:

- Slack mention or tagged thread describing a bug

Flow:

- summarize thread
- create or update a task
- attach relevant context
- optionally queue a workspace and launch an agent

Why it fits:

- Superset already has Slack intake and agent tooling in place

### 4. Nightly Changed-Files Audit

Trigger:

- schedule

Flow:

- look only at recently changed files, recent PRs, or high-risk areas
- run targeted checks
- surface only reproduced issues

Important:

- do not start with a repo-wide nightly sweep

## What Not To Do First

- Do not start with AI-generated monitors for every code region.
- Do not send raw automation alerts directly to humans.
- Do not let automations auto-merge fixes.
- Do not replace trusted hand-authored observability with generated logic.
- Do not treat "agent runs overnight" as a product if they do not have clear triggers and clear outcomes.

## Data Model Direction

The existing task and command tables should be reused where possible, but a real automation surface will likely need dedicated records for:

- `automation_definitions`
- `automation_runs`
- `automation_events`
- `automation_suppressions`
- `automation_artifacts`

Likely mappings:

- tasks remain the user-facing work object
- agent commands remain low-level execution records
- automation runs become the product-facing audit trail

## Recommended Rollout

### Phase 1

- Add `Automations` tab in web
- Ship template-based automations only
- Support GitHub merge audit and Slack bug intake
- Store run history and reviewable outcomes

### Phase 2

- Add Sentry-triggered triage
- Add suppression and dedupe controls
- Add separate model or agent selection by automation phase

### Phase 3

- Add limited monitor generation or code-aware coverage suggestions
- Add self-tuning thresholds only after enough run history exists

## Bottom Line

An `Automations` tab is a good fit for Superset, but the first version should be a reviewable control system, not a giant pile of generated monitors.

The right wedge is:

- event-driven
- diff-aware
- repro-first
- human-reviewed

That uses the product's current strengths instead of asking the system to be smarter than the surrounding tooling on day one.
