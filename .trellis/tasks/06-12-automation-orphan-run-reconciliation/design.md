# Design

## Fresh List Fallback

The Automations list currently renders only `collections.automations` from
Electric/TanStack. The cache can contain data while still repainting, and the
user-visible list can lag after a create mutation. Add a cloud `automation.list`
query fallback and merge it with the live rows:

- use live rows first for cache-first rendering;
- fetch a fresh list through tRPC;
- merge by `id`, preferring the fresher `updatedAt`;
- sort by `createdAt desc`;
- keep Mine/Team filtering unchanged.

## Run Reconciliation

Do not make the renderer infer terminal liveness directly. Add a cloud tRPC
mutation that can reconcile a single run. The cloud layer already owns
`automation_runs`; it can safely update stale rows after checking organization
access.

Initial reconciliation should be conservative:

- If the run is terminal, return it unchanged.
- If `status` is not `running` or `dispatching`, return it unchanged.
- If `startedAt`/`updatedAt` is older than a timeout, mark failed with
  `resultSource = "system"`.
- If the target host reports that the terminal session no longer exists, mark
  failed with `resultSource = "system"`.

Host terminal liveness is currently not available through cloud tRPC, so this
patch starts with the timeout path and exposes a clear seam for host-aware
reconciliation later. The UI should call reconciliation only for selected runs,
not poll every historical row aggressively.

## Host Selection And Dispatch Failure Normalization

Project context is metadata for the Automation run, not an execution location.
The cloud Automation dispatcher must not use a project to create or validate a
Code workspace. It should select from the user's accessible hosts:

- a requested host stays selected when present;
- when no host is pinned, use the first online accessible host;
- if every accessible host is offline, record a skipped run with a concise
  reason;
- relay and host errors become a clean `failed` run with
  `resultSource = "system"`.

Host-service remains the source of truth for local project setup, but default
Automation dispatch does not query or mutate that setup. Project context may be
used later by explicit tools, not by the scheduler itself.

## Portable Agent Resolution

Host-agent config ids are machine-local. If a run is rerouted from one host to
another, sending the original UUID to the new host can fail even when both hosts
support the same agent. Before `agents.runAutomation`, dispatch should query
the selected host's `settings.agentConfigs.list` so defaults are seeded and
exact ids/presets are known. If the selected host does not know the original id
and the source host differs, dispatch queries the source host config list and
maps the original instance id to its stable `presetId` before launching on the
selected host.

## Automation Runner Default

Automation entries may carry optional project context, but the execution
environment is no longer a v2 workspace. New Automations should allow
`v2ProjectId = null` and `v2WorkspaceId = null`. Dispatch must call a
host-service Automation runner that:

- creates a run-scoped directory under the host Superset home, e.g.
  `~/.superset/automation-runs/<runId>`;
- launches the chosen host agent from that directory;
- passes the existing run-scoped Superset API env;
- captures stdout/stderr to files for result fallback;
- never calls `workspaces.create`, never creates git worktrees, and never runs
  project `.superset/setup.sh`;
- leaves `automation_runs.v2WorkspaceId`, `sessionKind`, and terminal/chat
  session ids null for background Automation runs.

If an agent exits without writing back through the Superset CLI, the runner
should inspect the run row. If it is still active, exit code `0` becomes a
system fallback completion with captured output; non-zero exit/signal becomes a
system fallback failure with captured output.

## UI Behavior

On Automation detail:

- continue fetching selected run via `automation.getRun`;
- while selected run is non-terminal, periodically call reconciliation;
- merge the returned row through existing freshness helper;
- show failed/system reason in the result panel.
- show the run directory/runtime status instead of implying there is always a
  debuggable v2 workspace terminal.

On Automations list:

- show merged list count and rows;
- keep cache-first behavior so existing rows are never blanked while the fresh
  query loads.

## Data Safety

Reconciliation must be idempotent. It can only move a non-terminal stale row to
`failed`; it must never alter completed/skipped/failed rows.
