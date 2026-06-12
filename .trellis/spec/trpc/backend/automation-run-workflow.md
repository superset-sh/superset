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
- tRPC mutation: `automation.completeRun({ runId, resultMarkdown, resultJson?, resultSummary? })`.
- tRPC mutation: `automation.failRun({ runId, failureReason, resultMarkdown?, resultJson?, resultSummary? })`.
- SDK methods mirror the tRPC methods as `automations.getRun`, `automations.completeRun`, and `automations.failRun`.
- CLI writeback commands must call those SDK methods, not update the database directly.

### 3. Contracts

- `runNow` must return `{ automationId, runId, status, error? }`; skipped/failed dispatch outcomes are product-visible rows, not thrown exceptions unless there is a true API failure.
- Dispatch creates or reuses an `automation_runs` row before launching the agent.
- When the target host is missing or offline, write `status = "skipped"`, `failureReason`, `resultSource = "system"`, and `completedAt`.
- When relay/workspace/agent dispatch fails, write `status = "failed"`, `failureReason`, `resultSource = "system"`, and `completedAt`.
- When agent launch succeeds, write `status = "running"`, session ids, `v2WorkspaceId`, `startedAt`, and `dispatchedAt`.
- Agent processes receive run-scoped env: `SUPERSET_API_URL`, `SUPERSET_API_KEY`, `SUPERSET_AUTOMATION_ID`, `SUPERSET_AUTOMATION_RUN_ID`, `SUPERSET_AUTOMATION_RUN_SOURCE`, and `SUPERSET_AUTOMATION_RUN_TOKEN`.
- Run-scoped JWT access may only read/write its own run id. User JWT access must still respect organization membership and automation ownership.
- Completed/failed/skipped rows are terminal. `completeRun` and `failRun` must be idempotent and return the existing terminal row when called again.
- Desktop detail UI must treat Terminal as debug/source transcript. The normal run view should show lifecycle status and rendered Markdown result.
- Desktop selected-run UI must merge Electric/TanStack cached rows with a fresh `automation.getRun` query for the selected run. Pick the freshest row by timestamps so result panels converge after agent writeback even if live sync lags.

### 4. Validation & Error Matrix

- `runId` is not a UUID -> Zod validation error.
- Run does not exist or is outside caller organization -> `NOT_FOUND`.
- Run-scoped JWT tries another run id -> `FORBIDDEN`.
- `resultMarkdown` is empty on complete -> Zod validation error.
- `resultMarkdown` exceeds 200,000 chars -> Zod validation error.
- `failureReason` is empty on fail -> Zod validation error.
- `failureReason` exceeds 10,000 chars -> Zod validation error.
- Duplicate dispatch for the same automation/minute bucket -> return `conflict` and do not launch a second agent.
- Host missing/offline -> write a skipped row and return `{ status: "skipped", runId, error }`.
- Relay or host dispatch throws -> write a failed row and return `{ status: "failed", runId, error }`.

### 5. Good/Base/Bad Cases

- Good: manual `Run now` creates a selected run, shows `running`, launches the agent with run-scoped env, agent writes a Markdown report, result panel updates to `completed` without opening Terminal.
- Base: scheduled automation uses the same run lifecycle and result schema with `source = "schedule"`.
- Base: an old `dispatched` row remains readable in history while new rows use `running`.
- Bad: `Run now` throws because the host is offline and no history row is created.
- Bad: UI only reads Electric live rows and stays on stale `running` after the database row already has `completed` and `resultMarkdown`.
- Bad: the visible debug terminal command includes raw `SUPERSET_API_KEY=...` as a shell env prefix.

### 6. Tests Required

- Zod schema tests for `getRun`, `completeRun`, and `failRun` limits and required fields.
- Dispatch/router tests for `running`, `skipped`, `failed`, and `conflict` outcomes.
- Auth tests proving run-scoped JWTs cannot access another run.
- SDK/CLI tests proving complete/fail commands call the tRPC methods and read result files.
- Host-service tests proving one-off agent env is passed through without leaking token values into terminal-visible command prefixes.
- Renderer unit tests for status labels, Markdown result rendering, and selected-run freshness merging.
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
throw new TRPCError({ code: "PRECONDITION_FAILED", message: "target host offline" });
```

#### Correct

```ts
return { status: "skipped", runId: insertedRun.id, error: "target host offline" };
```
