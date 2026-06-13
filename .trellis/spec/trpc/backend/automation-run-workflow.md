# Automation Run Workflow

## Scenario: Result-Aware Automation Runs

### 1. Scope / Trigger

- Trigger: changing Automation behavior that crosses PostgreSQL schema, cloud tRPC, SDK/CLI, relay dispatch, host-service agent launch, and desktop renderer result display.
- Automation entries stay Superset-owned. Do not model this feature as external Issues, webhooks, or API-triggered jobs unless the product scope explicitly changes.
- The primary user-visible artifact of a run is an `automation_runs` result, not the debug terminal transcript.

### 2. Signatures

- DB enum: `automation_run_status` includes `queued`, `dispatching`, `running`, `completed`, `failed`, `skipped`, plus legacy-readable `dispatched`, `skipped_offline`, and `dispatch_failed`.
- DB enum: `automation_run_source` is `manual | schedule`.
- DB enum: `automation_run_result_source` is `agent_writeback | session_exit | system`.
- DB row: `automation_runs` includes `source`, `result_markdown`, `result_json`, `result_summary`, `result_source`, `failure_reason`, `terminal_exit_code`, `started_at`, `completed_at`, and `updated_at`.
- tRPC query: `automation.getRun({ runId })`.
- tRPC mutation: `automation.reconcileRun({ runId })`.
- tRPC mutation: `automation.completeRun({ runId, resultMarkdown, resultJson?, resultSummary? })`.
- tRPC mutation: `automation.failRun({ runId, failureReason, resultMarkdown?, resultJson?, resultSummary? })`.
- Host-service mutation: `workspaceCleanup.destroy({ workspaceId, deleteBranch, force, skipDirtyCheck? })`.
- SDK methods mirror the tRPC methods as `automations.getRun`, `automations.completeRun`, and `automations.failRun`.
- CLI writeback commands must call those SDK methods, not update the database directly.

### 3. Contracts

- `runNow` must return `{ automationId, runId, status, error? }`. Manual Run Now returns after a durable `automation_runs` row exists with `status = "dispatching"`; it must not wait for host resolution, workspace creation, or agent startup.
- Manual Run Now continues dispatch in the background against the same row. Host missing/offline, relay/runner, and agent launch outcomes must update that row to `skipped`, `failed`, or `running`; do not create a second run row for the same click.
- Scheduled dispatch may wait for the full host runner and agent startup path because scheduler advancement depends on the dispatch outcome.
- Dispatch creates or reuses an `automation_runs` row before launching the agent.
- When the target host is missing or offline, write `status = "skipped"`, `failureReason`, `resultSource = "system"`, and `completedAt`.
- When relay/runner/agent dispatch fails, write `status = "failed"`, `failureReason`, `resultSource = "system"`, and `completedAt`.
- Relay/host precondition errors must be normalized into concise run-facing reasons. Do not surface the raw relay JSON body, SQL dumps, or host stack trace in the result panel.
- When background agent launch succeeds, write `status = "running"`, `hostId`, `startedAt`, and `dispatchedAt`. Default background Automation runs must leave `v2WorkspaceId`, `sessionKind`, `chatSessionId`, and `terminalSessionId` null.
- Automation project context and execution runtime are separate. A null `automations.v2ProjectId` is valid and means the run has no project context. A non-null project id may support file mentions or future context tools, but it must not imply cloning, git worktree creation, `.superset/setup.sh`, or v2 workspace rows.
- Default Automation execution must call a host-service Automation runner, not `workspaces.create` or `agents.run` with a workspace id. The runner owns a host-local Automation task directory such as `~/.superset/automations/<automationId>` and process lifecycle. Individual runs should write lightweight artifacts under that directory, for example `runs/<runId>.stdout.log`, instead of creating a full working directory for every run.
- The Automation task directory is also the stable materialization boundary for
  Automation context. Future Skill, CLI, MCP, model, attachment, and project
  context integrations should write automation-owned config/cache files under
  `~/.superset[/dev]/automations/<automationId>` or an explicit
  `SUPERSET_AUTOMATION_RUNS_DIR/<automationId>` override, never under user-global
  tool config directories.
- Individual runs may keep lightweight per-run artifacts, including the prompt,
  stdout/stderr logs, metadata, and a context snapshot manifest under
  `runs/<runId>.*`. A run snapshot should reference the Automation context
  versions used for reproducibility; it must not copy full Skill/CLI/MCP
  installations or raw provider/tool secrets into every run.
- Project context is metadata only for default Automation execution. It must not influence host selection through clone URL, local setup state, workspace rows, or worktree availability. Choose the requested host when available, otherwise choose the first online accessible host.
- Host-agent config ids are machine-local. If dispatch reroutes to a different host, resolve the selected host's agent configs, map the source instance id to its portable `presetId` when needed, and launch with the target host's matching preset/config.
- Agent processes receive run-scoped env: `SUPERSET_API_URL`, `SUPERSET_API_KEY`, `SUPERSET_AUTOMATION_ID`, `SUPERSET_AUTOMATION_RUN_ID`, `SUPERSET_AUTOMATION_RUN_SOURCE`, and `SUPERSET_AUTOMATION_RUN_TOKEN`.
- Agent processes may also receive automation-scoped context env such as
  `SUPERSET_AUTOMATION_DIR` and runner-specific config env. These env values
  should point at automation-owned files inside the Automation task directory.
  Run-scoped env remains separate so a process can identify and write back to
  the current run.
- Run-scoped JWT access may only read/write its own run id. User JWT access must still respect organization membership and automation ownership.
- Completed/failed/skipped rows are terminal. `completeRun` and `failRun` must be idempotent and return the existing terminal row when called again.
- `reconcileRun` is conservative and idempotent. It may only move stale active statuses (`queued`, `dispatching`, `running`, or legacy `dispatched`) to `failed` with `resultSource = "system"`; it must return terminal rows unchanged.
- Legacy Automation run workspaces are ephemeral only for rows that already have `automation_runs.v2WorkspaceId` while `automations.v2WorkspaceId` is null. Terminal transitions may schedule best-effort cleanup through relay -> `workspaceCleanup.destroy` for those legacy rows.
- Legacy Automation cleanup must call `workspaceCleanup.destroy` with `{ force: false, skipDirtyCheck: true, deleteBranch: true }`. `skipDirtyCheck` bypasses dirty-worktree blocking but still runs `.superset/teardown.sh`; `force: true` is wrong for this path because it skips teardown and can leak Docker/services.
- New default Automation runs must not need workspace cleanup because no workspace/worktree was created.
- Desktop detail UI must treat Terminal as debug/source transcript. The normal run view should show lifecycle status and rendered Markdown result.
- Desktop selected-run UI must merge Electric/TanStack cached rows with a fresh `automation.getRun` query for the selected run. Pick the freshest row by timestamps so result panels converge after agent writeback even if live sync lags.
- Desktop Previous Runs UI must merge Electric/TanStack cached rows with a fresh `automation.listRuns` query for the Automation. This is required after cross-device `Run now`: the API-created run must be visible when the user returns to the detail page even if Electric has not repainted locally.
- Desktop list UI must merge Electric/TanStack cached Automation rows with a fresh `automation.list` query. Render cached rows first and de-dupe by id so create/update lag in Electric does not hide rows.

### 4. Validation & Error Matrix

- `runId` is not a UUID -> Zod validation error.
- Run does not exist or is outside caller organization -> `NOT_FOUND`.
- Run-scoped JWT tries another run id -> `FORBIDDEN`.
- `resultMarkdown` is empty on complete -> Zod validation error.
- `resultMarkdown` exceeds 200,000 chars -> Zod validation error.
- `failureReason` is empty on fail -> Zod validation error.
- `failureReason` exceeds 10,000 chars -> Zod validation error.
- Duplicate dispatch for the same automation/minute bucket -> return `conflict` and do not launch a second agent.
- Host missing/offline -> write or update a skipped row with `{ status: "skipped", runId, error }`; manual Run Now may initially return `{ status: "dispatching", runId }` before the background update lands.
- Relay or host dispatch throws -> write or update a failed row with `{ status: "failed", runId, error }`; manual Run Now may initially return `{ status: "dispatching", runId }` before the background update lands. Do not create a v2 workspace while handling dispatch.
- Project context references a local-only or not-yet-imported project -> default Automation dispatch still uses the selected host runner and does not clone, create a worktree, run setup, or fail preflight because of project setup.
- Automation context references a Skill, CLI, or MCP entry unavailable on the
  target host -> fail or skip the run with a concise context-preflight reason;
  do not silently fall back to user-global tools or mutate user-global config.
- Requested host is offline or inaccessible -> write a skipped/failed row with a concise host-facing reason.
- Rerouted run with machine-local agent id -> map to the source config's preset id before `agents.runAutomation`.
- Existing `v2WorkspaceId` points to any workspace -> ignore it for default Automation execution unless a future explicit legacy workspace mode is added. Do not create a replacement workspace.
- `reconcileRun` receives a terminal row -> return it unchanged.
- `reconcileRun` receives a stale active row -> write `status = "failed"`, `failureReason`, `resultSource = "system"`, `completedAt`, and `updatedAt`.
- Legacy terminal run has an isolated run workspace -> cleanup scheduled; relay/host cleanup failure is logged and does not roll back the run result.
- Terminal run reused an explicit workspace -> cleanup skipped.
- Automation cleanup uses `force: true` -> invalid because teardown is skipped and Docker Compose services can remain alive.

### 5. Good/Base/Bad Cases

- Good: manual `Run now` creates and selects a real `dispatching` run quickly, then the same row moves to `running` after host background runner startup, receives run-scoped env, and eventually updates to `completed` with a Markdown report without opening Terminal.
- Good: a default Automation task uses `~/.superset/automations/<automationId>` as the stable working directory and writes each run's output files under `runs/<runId>.*`; it does not create a worktree or start project Docker services.
- Good: Skill, CLI, MCP, and model configuration are materialized once per
  Automation under `~/.superset/automations/<automationId>` and each run stores
  only a small manifest describing which context versions were used.
- Base: scheduled automation uses the same run lifecycle and result schema with `source = "schedule"`.
- Base: an old `dispatched` row remains readable in history while new rows use `running`.
- Bad: `Run now` throws because the host is offline and no history row is created.
- Bad: UI only reads Electric live rows and stays on stale `running` after the database row already has `completed` and `resultMarkdown`.
- Bad: Previous Runs only reads `collections.automationRuns`; a newly-created run disappears after navigating away and back before Electric sync catches up.
- Bad: the visible debug terminal command includes raw `SUPERSET_API_KEY=...` as a shell env prefix.
- Bad: every scheduled run creates a worktree plus Postgres/Electric/Neon Docker containers.
- Bad: every scheduled run copies a full Skill bundle, CLI install, MCP config,
  or model provider secret into a new run directory.

### 6. Tests Required

- Zod schema tests for `getRun`, `completeRun`, and `failRun` limits and required fields.
- Dispatch/router tests for `running`, `skipped`, `failed`, and `conflict` outcomes.
- Auth tests proving run-scoped JWTs cannot access another run.
- SDK/CLI tests proving complete/fail commands call the tRPC methods and read result files.
- Reconciliation helper tests proving stale active rows fail, recent active rows stay active, and terminal rows are unchanged.
- Dispatch error tests proving relay 412 project-setup failures are normalized to user-facing text.
- Dispatch host selection tests proving project context does not create or require workspaces, and requested/default online hosts are selected without project setup checks.
- Dispatch agent selection tests proving machine-local source ids map to portable preset ids after host reroute.
- Host-service tests proving one-off agent env is passed through without leaking token values into visible command strings.
- Host-service tests proving `agents.runAutomation` uses a Superset-home run directory and does not require a workspace id.
- Host-service tests proving Automation context materialization writes under the
  Automation task directory and per-run snapshots stay lightweight and secret-free.
- Host-service tests proving `workspaceCleanup.destroy({ skipDirtyCheck: true, force: false })` bypasses dirty preflight while still preserving teardown semantics.
- Automation cleanup tests proving isolated run workspaces are cleaned, runs without host/workspace are skipped, and explicit reusable workspaces are not destroyed.
- Renderer unit tests for status labels, Markdown result rendering, and selected-run freshness merging.
- Renderer unit tests for Previous Runs merge behavior: fresh `automation.listRuns` rows appear before Electric repaint, duplicate rows are de-duped by id, fresher rows win, and newest-created ordering is preserved.
- Renderer unit tests for Automation list merge behavior: cloud rows appear before Electric repaint, fresher rows win, and live-only fields are preserved.
- Real desktop acceptance: create or select an automation, click `Run now`, observe a running row, wait for completion, verify rendered Markdown result panel, then open debug terminal only as a secondary action.

### 7. Wrong vs Correct

#### Wrong

```ts
const runs = await automationRunsCollection();
const selectedRun = runs.find((run) => run.id === selectedRunId);
return selectedRun?.status === "running" ? <Waiting /> : <Result run={selectedRun} />;
```

#### Correct

```ts
const liveRun = runs.find((run) => run.id === selectedRunId) ?? null;
const freshRun = await trpc.automation.getRun.query({ runId: selectedRunId });
const selectedRun = pickFreshestAutomationRun(liveRun, freshRun);
return <AutomationRunResultPanel run={selectedRun} />;
```

#### Wrong

```ts
const previousRuns = await automationRunsCollection.where({ automationId });
return <PreviousRunsList runs={previousRuns} />;
```

#### Correct

```ts
const liveRuns = await automationRunsCollection.where({ automationId });
const freshRuns = await trpc.automation.listRuns.query({ automationId, limit: 10 });
const previousRuns = mergeAutomationRuns(liveRuns, freshRuns);
return <PreviousRunsList runs={previousRuns} />;
```

#### Wrong

```ts
throw new TRPCError({ code: "PRECONDITION_FAILED", message: "target host offline" });
```

#### Correct

```ts
return { status: "skipped", runId: insertedRun.id, error: "target host offline" };
```

#### Wrong

```ts
const workspaceId = automation.v2WorkspaceId ?? created.workspaceId;
```

#### Correct

```ts
const result = await relayMutation("agents.runAutomation", {
	runId,
	automationId,
	agent,
	prompt,
	env,
});
// No v2 workspace is created for default Automation execution.
```

#### Wrong

```ts
await relayMutation("workspaceCleanup.destroy", {
	workspaceId: run.v2WorkspaceId,
	deleteBranch: true,
	force: true,
});
```

#### Correct

```ts
await relayMutation("workspaceCleanup.destroy", {
	workspaceId: run.v2WorkspaceId,
	deleteBranch: true,
	force: false,
	skipDirtyCheck: true,
});
```
