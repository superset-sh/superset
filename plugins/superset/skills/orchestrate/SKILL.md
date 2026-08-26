---
name: orchestrate
description: Coordinate several coding agents in parallel through Superset, each in its own workspace, with follow-ups, progress reads, dependency tracking, and structured results. Use when the user asks to delegate, parallelize, fan out, or split up coding work across agents, workspaces, or hosts, hand work between agents, or monitor workers, including "spin up agents for each of these", "run these in parallel", "what are my workers doing". Not for ordinary single-agent workspace, task, or automation management.
argument-hint: the work to split up and coordinate
allowed-tools: Bash(superset:*)
---

# Superset Orchestration

Coordinate terminal agents with Superset's workspace, agent, and terminal commands. Treat this as a coordinator-driven protocol: Superset provides session transport, while the coordinator owns task dependencies and completion state.

## Establish the control surface

1. Run `superset auth whoami --json`.
2. Run `superset terminals --help` and require `list`, `read`, `send`, and `close`.
3. If those commands are absent, run `superset update` and recheck. Do not invent or substitute unsupported orchestration commands.
4. Resolve the workspace, host, and terminal-capable agent before dispatching:

```bash
superset hosts list --json
superset agents list --local --json
superset workspaces list --local --json
```

When coordinating from inside the target workspace, pass `--workspace "$SUPERSET_WORKSPACE_ID"` explicitly to agent and terminal commands. Only `workspaces get` defaults its workspace ID from that environment variable. Pass `--host <id>` consistently for a remote host. If the target host is offline, use `hosts wake <id>` and confirm it is online before dispatching. Do not use `--agent superset`: it creates a chat session, and terminal read/send cannot control it.

## Plan the work

Create a compact coordinator table with these fields:

| Field | Purpose |
| --- | --- |
| Task | Stable short identifier |
| Dependencies | Tasks that must complete first |
| Workspace | Superset workspace ID |
| Host | Host ID, or local |
| Terminal | `sessionId` returned by `agents create` |
| Status | `pending`, `ready`, `running`, `completed`, `blocked`, or `failed` |
| Result | Summary, files, checks, and follow-up work |

Keep this state in the coordinator's working context. Superset organization tasks are issue-tracker records, not orchestration DAG nodes; do not create or mutate them unless the user asks.

Prefer independent tasks and shallow dependency chains. For parallel editing, give workers separate workspaces/branches. Sharing one workspace is appropriate for read-only analysis or deliberately complementary work with non-overlapping files.

## Define the worker protocol

Give every worker a bounded prompt containing:

- task ID and objective;
- workspace scope and files it may change;
- acceptance criteria and verification commands;
- dependencies or prior findings it needs;
- a warning not to broaden scope or overwrite unrelated changes;
- the completion envelope below.

Require the worker's final response to end with one of these envelopes:

```text
SUPERSET_WORKER_DONE
task: <task-id>
summary: <one-line outcome>
files: <comma-separated paths or none>
checks: <commands and outcomes>
handoff: <next-step context or none>
```

```text
SUPERSET_WORKER_BLOCKED
task: <task-id>
reason: <specific blocker>
needs: <decision, access, or dependency required>
```

These markers are a prompt convention visible in terminal snapshots, not durable Superset events. Treat malformed or missing envelopes as unstructured output and inspect the full snapshot.

## Dispatch workers

Launch a terminal agent once and retain its session ID:

```bash
superset agents create \
  --workspace <workspace-id> \
  --host <host-id> \
  --agent <preset-or-config-id> \
  --effort <supported-level> \
  --attachment <optional-path> \
  --prompt "<worker prompt>" \
  --json
```

Omit `--effort` or `--attachment` when they are not needed. The result is `{ "kind", "sessionId", "label" }`. Require `kind` to be `terminal`; store `sessionId` as the terminal ID. Launch all ready, independent tasks before monitoring them.

Use `superset workspaces create` first when a worker needs an isolated branch. Do not create parallel editing workers in the same worktree unless their file ownership is explicitly disjoint.

## Monitor and communicate

Reacquire live terminal IDs after losing coordinator context or restarting the host service:

```bash
superset terminals list \
  --workspace <workspace-id> \
  --host <host-id> \
  --json
```

Terminal discovery does not identify semantic recipients or agent completion state. Preserve the coordinator table's task-to-terminal mapping whenever possible.

Read recent output without mutating the session:

```bash
superset terminals read \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --max-lines 240 \
  --json
```

The JSON result includes `text`. Inspect it for the completion or blocked envelope and confirm that the surrounding output supports the claimed result. `terminals list` reports live sessions, not whether an agent is working or idle; do not infer completion from presence, absence, `attached`, or terminal title alone.

Send clarification, dependency results, review feedback, or a handoff into the existing session:

```bash
superset terminals send \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --text "<follow-up>" \
  --json
```

Poll at a measured cadence and read all running workers in each pass. Prefer several short monitoring passes over one long blocking shell loop so progress and user updates remain visible.

## Advance the workflow

1. Mark a task `completed` only after reading a `SUPERSET_WORKER_DONE` envelope and checking its evidence.
2. Mark it `blocked` when the worker emits `SUPERSET_WORKER_BLOCKED`; resolve the need or ask the user before redispatching.
3. Promote pending tasks to `ready` only when every dependency is completed.
4. Include dependency results in the next worker prompt or send them to an already-running dependent worker.
5. Redispatch a failed task only after changing the prompt, inputs, or worker choice. Stop after repeated failures and report the blocker.
6. Independently verify risky or overlapping changes before presenting the combined result.

For isolated branches, ask each implementation worker to commit or otherwise provide an exact handoff only when that action is within the user's requested workflow. Superset does not merge worker branches automatically.

## Finish and clean up

Summarize each task's outcome, workspace/branch, files changed, checks, blockers, and integration order. Distinguish worker claims from checks the coordinator independently ran.

Keep completed terminals available when the user may want to inspect or continue them. Close a terminal only when cleanup is requested or clearly part of the workflow:

```bash
superset terminals close \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --json
```

Closing a terminal ends that session. Deleting a workspace is a separate destructive action and requires explicit scope.
