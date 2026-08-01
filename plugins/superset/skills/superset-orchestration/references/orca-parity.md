# Orca-to-Superset orchestration parity

Use this reference when explaining the skill's architecture, evaluating parity with Orca, or planning native Superset orchestration features.

## Current mapping

| Orca orchestration capability | Superset CLI approximation | Current gap |
| --- | --- | --- |
| Addressed `send`, `reply`, and inbox messages | Discover live sessions with `terminals list`, then use `terminals send` and `terminals read` against a workspace/terminal pair | No semantic recipient identity, mailbox, thread ID, unread state, group addressing, priority, or push-on-idle delivery |
| Persistent task DAG | Coordinator-owned table; organization `tasks` only when the user explicitly wants tracker records | No dependency schema, automatic readiness promotion, or orchestration-specific task lifecycle |
| Structured dispatch context | `agents create` with a complete worker prompt, optional attachments, and agent-specific reasoning effort | No separate dispatch record, retries, assignment history, or circuit breaker |
| `worker_done` and `escalation` events | `SUPERSET_WORKER_DONE` and `SUPERSET_WORKER_BLOCKED` text envelopes read from the terminal snapshot | Prompt convention only; no durable event, schema validation, or guaranteed delivery |
| Long-poll `check --wait` | Repeated `terminals read` calls; host service already persists agent hook bindings with last event type and timestamp | Lifecycle bindings are not exposed through the CLI/SDK, and there is no long-poll, idle wait, event cursor, or timeout-aware wait command |
| Decision gates | Coordinator stops dependent dispatch and asks the user | No persistent gate object, options, resolution record, or automatic redispatch context |
| Background coordinator loop | Active agent follows the dispatch-monitor-advance workflow; automations provide durable scheduled/single-agent dispatch and queryable run state | No dependency-aware background coordinator, durable coordinator phase, orchestration restart recovery, or singleton enforcement |
| Group dispatch | Launch or message each terminal individually | No `@all`, agent-kind, idle, or workspace group selectors |
| Runtime reset | Close explicitly selected terminals | No orchestration store to reset; workspace deletion is broader and destructive |

## What the skill can reproduce now

- Isolated workers across local or remote Superset workspaces.
- Parallel dispatch through configured terminal-agent presets.
- Terminal rediscovery after coordinator or host-service context loss.
- Follow-up conversations without spawning replacement sessions.
- Read-only observation of terminal output and scrollback.
- Coordinator-managed dependency waves and human decision points.
- Structured-enough handoffs through a stable textual completion envelope.
- Dispatch with attachments and agent-specific reasoning effort.
- Remote-host wake-up before dispatch.

Superset also has adjacent durable primitives that do not replace orchestration state: automations persist background run metadata, while ACP sessions persist Superset chat sessions/messages and support restart recovery, streaming progress, cancellation, and permission responses. Neither provides an addressed terminal-agent mailbox or a task DAG.

## What requires product support

Prioritize these additions if Superset needs Orca-like reliability rather than skill-level coordination:

1. Expose the existing terminal-agent lifecycle bindings through the CLI/SDK and add `terminals wait --for idle|exit` using those host agent hooks.
2. Add a durable orchestration message/event store with recipient, thread, type, priority, payload, and read cursor.
3. Add orchestration task and dispatch entities with dependencies, assignment history, retries, and atomic readiness promotion.
4. Add decision-gate records and resolution injection.
5. Add a host or control-plane coordinator loop that survives the initiating agent session and emits queryable run state.

Do not overload Superset's organization task tracker for these runtime entities. Tracker tasks model product work; orchestration tasks and dispatch attempts have different lifecycles, retention, and failure semantics.
