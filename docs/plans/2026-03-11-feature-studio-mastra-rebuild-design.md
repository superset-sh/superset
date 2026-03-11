# Feature Studio Mastra Rebuild Design

Date: 2026-03-11
Status: In implementation
Scope: Rebuild the existing `agent-desk` style feature creation flow as a persistent, company-internal `Feature Studio` on top of Superset and Mastra.

## Implementation Snapshot

As of 2026-03-11, phase 1 implementation has landed in a working branch with the following pieces in place:

- durable `feature-studio` schema and status model in Postgres-backed Drizzle,
- `packages/features-server` request, approval, runner, worktree, preview, browser QA, and registration services,
- `packages/agent` generation entrypoints for spec and plan creation,
- desktop Atlas `Studio` queue/detail surfaces,
- preview review UI with explicit approval actions,
- server-side persistence for preview URLs, QA artifacts, and approval history.

Remaining gaps are primarily rollout and verification work:

- broader end-to-end verification against a real database and runtime,
- migration generation and deployment on a Neon branch,
- operational env setup in shared environments,
- progressive cutover from `agent-desk` to `feature-studio`.

## Goal

Rebuild feature authoring as a long-lived operational system where agents and humans collaborate to:

1. turn conversations into a feature spec and implementation plan,
2. pause for human review and approval,
3. implement the feature in an isolated worktree,
4. verify and deploy a Vercel preview,
5. run agent browser QA,
6. let a human review and customize the result,
7. register the feature only after final approval.

This system is intended to be the internal company workflow for creating and maintaining reusable features for Superbuilder.

## Product Direction

This is not a chat assistant with transient memory.

This is a persistent feature production system:

- feature requests survive process restarts,
- approval queues remain available until acted on,
- implementation and QA history remain queryable,
- preview links and approval decisions are stored as durable records,
- registration is a final gated action, not an automatic side effect of code generation.

## Core Principles

1. Postgres is the system of record.
2. Mastra is the workflow and runtime engine, not the source of truth.
3. Existing implementation rules and workflow rules in the codebase remain the source of truth for how features should be generated.
4. One feature request maps to one isolated worktree and one branch.
5. Vercel preview is the standard review surface during the stabilization phase.
6. A generated feature is not considered registered until explicit final approval and registry integration complete.

## High-Level Architecture

The rebuilt system is split into four layers.

### 1. Conversation Layer

User-facing interface for creating and iterating on feature requests.

Responsibilities:

- capture user intent,
- attach source material and constraints,
- display generated spec and plan,
- show pending approvals,
- present implementation, QA, and registration progress.

### 2. Workflow Layer

Mastra-based orchestration for the end-to-end lifecycle of a feature request.

Responsibilities:

- drive step-by-step execution,
- suspend and resume at approval gates,
- store run metadata and failures,
- coordinate implementation, verification, deployment, and QA stages.

### 3. Execution Layer

Agent-driven code generation and verification inside isolated git worktrees.

Responsibilities:

- create and manage worktrees,
- generate and modify code,
- run lint, typecheck, tests, and smoke checks,
- deploy Vercel preview builds,
- run browser-based agent QA.

### 4. Registry Layer

Final feature registration and activation.

Responsibilities:

- update feature registry metadata,
- ensure only approved features are registerable,
- preserve traceability from request to final registered feature.

## Required Persistent Lifecycle

The feature request lifecycle is durable and queryable at all times.

Recommended state model:

`draft -> spec_ready -> pending_spec_approval -> plan_approved -> implementing -> verifying -> preview_deploying -> agent_qa -> pending_human_qa -> customization -> pending_registration -> registered`

Terminal or exceptional states:

- `failed`
- `discarded`

Notes:

- approval states are paused states, not running states,
- the system must be able to restart and continue from any saved state,
- users must be able to revisit pending approvals later and approve or discard them.

## Approval Model

The workflow includes three explicit human approval gates.

### Gate 1. Spec and Plan Approval

After conversation analysis, the system generates:

- feature spec,
- implementation plan,
- test strategy,
- affected areas summary.

The workflow then pauses in `pending_spec_approval`.

Possible outcomes:

- approve,
- request revision,
- discard.

### Gate 2. Human QA Approval

After implementation, verification, preview deployment, and agent browser QA, the system pauses in `pending_human_qa`.

The reviewer receives:

- Vercel preview link,
- verification report,
- agent browser QA report,
- changed files summary.

Possible outcomes:

- approve into customization,
- request more changes,
- discard.

### Gate 3. Registration Approval

After human customization and final edits, the system pauses in `pending_registration`.

Possible outcomes:

- register,
- request another revision cycle,
- discard.

## Worktree and Branch Model

Each feature request runs in an isolated git worktree.

Recommended invariant:

- one feature request = one worktree,
- one feature request = one branch,
- one feature request = one preview environment lineage.

This allows multiple concurrent feature builds without file conflicts and keeps implementation history simple.

Stored execution metadata should include:

- `worktree_path`,
- `branch_name`,
- `base_branch`,
- `current_commit_sha`,
- `last_verified_commit_sha`,
- `preview_url`,
- `preview_provider`,
- `preview_created_at`,
- `worktree_status`.

The same branch remains active across:

- initial implementation,
- agent QA fixes,
- human customization,
- final registration preparation.

## Preview and QA Strategy

During stabilization, preview review uses Vercel only.

Standard sequence:

1. implementation completes,
2. verification passes,
3. Vercel preview is deployed,
4. agent runs browser QA on the preview URL,
5. human reviews the same preview URL.

Preview metadata must be stored as durable artifacts, including:

- preview URL,
- provider as `vercel`,
- commit SHA used for deployment,
- deployment timestamp,
- agent QA report,
- human QA decision and notes.

This ensures the system can always answer which build was reviewed and approved.

## Database Strategy

Postgres is the canonical persistence layer for this system.

`local-db` must not be used as the system of record for Feature Studio because the workflow is:

- multi-step,
- long-lived,
- approval-driven,
- potentially multi-user,
- operationally critical for the company.

`local-db` may still be used for desktop-only convenience state such as:

- local UI preferences,
- recent views,
- ephemeral client cache.

But all business-critical state must live in server-side Postgres.

## Recommended Domain Model

The current `agent-desk` schema shows the right direction in using Postgres-backed durable feature state, but the rebuild should shift from session-centric storage to work-item-centric storage.

Recommended tables:

### `feature_requests`

Root record for a feature creation request.

Suggested fields:

- `id`
- `title`
- `summary`
- `raw_prompt`
- `status`
- `created_by_id`
- `workspace_id` or target project reference
- `ruleset_reference`
- `current_run_id`
- timestamps

### `feature_request_messages`

Conversation and instruction history.

Suggested fields:

- `id`
- `feature_request_id`
- `role`
- `content`
- `kind`
- `metadata`
- timestamps

### `feature_request_artifacts`

Versioned outputs generated during the workflow.

Artifact kinds should include:

- `spec`
- `plan`
- `implementation_summary`
- `verification_report`
- `agent_qa_report`
- `human_qa_notes`
- `registration_manifest`
- `preview_metadata`

Suggested fields:

- `id`
- `feature_request_id`
- `kind`
- `version`
- `content`
- `metadata`
- `created_by`
- timestamps

### `feature_request_approvals`

Approval queue and decision history.

Suggested fields:

- `id`
- `feature_request_id`
- `approval_type`
- `status`
- `requested_from_id`
- `decided_by_id`
- `decision_notes`
- `approved_artifact_version`
- `requested_at`
- `decided_at`

Approval types:

- `spec_plan`
- `human_qa`
- `registration`

### `feature_request_runs`

Workflow execution tracking.

Suggested fields:

- `id`
- `feature_request_id`
- `workflow_name`
- `workflow_step`
- `status`
- `resume_token` or runtime checkpoint reference
- `last_error`
- `retry_count`
- timestamps

### `feature_request_worktrees`

Execution environment and git lineage.

Suggested fields:

- `id`
- `feature_request_id`
- `worktree_path`
- `branch_name`
- `base_branch`
- `head_commit_sha`
- `last_verified_commit_sha`
- `preview_url`
- `preview_provider`
- `preview_commit_sha`
- `preview_status`
- timestamps

### `feature_registrations`

Final registration record.

Suggested fields:

- `id`
- `feature_request_id`
- `feature_key`
- `registry_version`
- `registered_by_id`
- `registered_commit_sha`
- `registration_metadata`
- timestamps

## Mastra Workflow Design

The workflow should be modeled as a persistent, resumable step machine rather than a single long-running chat agent.

Recommended steps:

1. `collect_intent`
2. `generate_spec`
3. `generate_plan`
4. `wait_spec_approval`
5. `implement_feature`
6. `run_verification`
7. `deploy_preview`
8. `agent_browser_qa`
9. `wait_human_qa`
10. `apply_customization`
11. `wait_registration_approval`
12. `register_feature`

Key rule:

- approval waits must use suspend and resume behavior,
- workflow progress must be mirrored into Postgres domain state,
- UI should render from domain state, not from in-memory runtime state.

## Relationship Between Mastra and Postgres

Responsibilities should be separated cleanly.

### Postgres owns:

- canonical request status,
- approval queue,
- artifacts,
- preview metadata,
- registration state,
- audit history.

### Mastra owns:

- orchestration,
- step execution,
- tool usage,
- runtime memory,
- suspend and resume control flow,
- execution traces.

If runtime state and DB state diverge, DB state is the product-level source of truth.

## Interaction With Existing Rules

Existing feature implementation rules and workflows already documented in the codebase remain the authoritative generation contract.

The new system should not duplicate that logic into prompts by hand.

Instead, agents should:

- read and apply those rule documents,
- treat them as constraints,
- produce outputs that conform to the same standards for feature structure, registration, and workflow usage.

## Human and Agent Collaboration Model

The system should assume both autonomous and collaborative editing.

### Before approval

Agent is responsible for:

- drafting spec,
- drafting plan,
- generating implementation.

### During human QA and customization

Humans may:

- review preview behavior,
- request edits,
- directly customize code,
- continue collaborating with the agent in the same branch/worktree.

### Before registration

The system must require a final explicit approval before making the feature available in the registry.

## Why Rebuild Instead of Incrementally Extending Agent Desk

The current `agent-desk` structure is useful as historical reference, but it is primarily organized around:

- prompt-driven services,
- session-like flow,
- imperative execution,
- limited long-lived approval semantics.

The new Feature Studio requires:

- durable workflow states,
- resumable approval gates,
- isolated concurrent execution,
- preview-based QA lineage,
- stronger separation of generated, reviewed, and registered states.

That makes a Mastra-native rebuild more accurate than continuing to patch the old architecture.

## Initial Non-Goals

To keep the rebuild focused, the first version should not attempt:

- multi-provider preview review beyond Vercel,
- automatic registration without explicit approval,
- local-db-first persistence,
- generalized arbitrary deployment orchestration beyond what is needed for feature authoring,
- full replacement of all existing systems on day one.

## Recommended First Milestone

Deliver a thin but complete vertical slice:

1. create feature request from conversation,
2. generate spec and plan,
3. persist pending approval,
4. approve from queue,
5. generate code in isolated worktree,
6. run verification,
7. deploy Vercel preview,
8. persist agent QA report,
9. allow human review and customization,
10. perform final registration.

This gives a full production loop before optimization.

## Open Decisions Deferred to Implementation Planning

- exact repository location and package boundaries for the new Feature Studio modules,
- whether to migrate any existing `agent-desk` data forward,
- exact Mastra storage adapter choice for persistent workflow state,
- branch naming conventions and cleanup policy,
- Vercel preview linking details and auth model,
- registry integration API surface.

## Final Recommendation

Proceed with a new Mastra-native `Feature Studio` built on top of Superset with Postgres as the system of record, request-scoped worktrees for isolated execution, and Vercel preview as the review surface.

This architecture is the best fit for a company-internal, long-lived feature production system where conversations lead to durable specs, approved plans, implemented code, verified previews, and gated feature registration.
