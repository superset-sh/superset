# RFC: Workspace Terminal Stream Bus

Status: Draft
Owners: Desktop Runtime
Last updated: 2026-03-05

## Goal

Replace per-pane terminal subscriptions with one workspace-scoped stream that carries all terminal events for that workspace.

This RFC is focused on stream topology and event contract. It intentionally keeps control-plane mutations (`createOrAttach`, `write`, `resize`, `kill`) unchanged.

## Why

Current behavior has one subscription per pane and pane-scoped event channels. That scales listener count and IPC overhead linearly with open panes and makes replay/recovery harder.

A workspace bus provides:

1. One subscription per workspace instead of per pane.
2. A single ordered event channel for lifecycle and data events.
3. A clean seam for replay and future binary transport.

## Non-goals

1. No behavior change to terminal session lifecycle semantics.
2. No feature-flag rollout.
3. No cloud backend implementation in this change.
4. No API change to terminal control mutations.

## Current state

1. Renderer subscribes with `terminal.stream(paneId)` per pane.
2. Main process emits pane-specific events (`data:${paneId}`, `exit:${paneId}`, etc.).
3. Event delivery is at-most-once with no bounded replay.

## Proposal

Add a new tRPC subscription: `terminal.streamWorkspace`.

Input:

```ts
{
  workspaceId: string;
  sinceEventId?: number;
}
```

Output (single event union):

```ts
{
  type: "terminal.data";
  workspaceId: string;
  sessionId: string;
  paneId: string;
  eventId: number;
  sessionSeq: number;
  ts: number;
  data: string;
}
|
{
  type: "terminal.exit";
  workspaceId: string;
  sessionId: string;
  paneId: string;
  eventId: number;
  sessionSeq: number;
  ts: number;
  exitCode: number;
  signal?: number;
  reason?: "killed" | "exited" | "error";
}
|
{
  type: "terminal.error";
  workspaceId: string;
  sessionId: string;
  paneId: string;
  eventId: number;
  sessionSeq: number;
  ts: number;
  code?: string;
  message: string;
}
|
{
  type: "terminal.disconnect";
  workspaceId: string;
  sessionId: string;
  paneId: string;
  eventId: number;
  sessionSeq: number;
  ts: number;
  reason: string;
}
|
{
  type: "terminal.watermark";
  workspaceId: string;
  eventId: number;
  ts: number;
}
```

## Contract invariants

1. Subscription MUST NOT complete on terminal exit.
2. `eventId` is monotonic per workspace stream.
3. `sessionSeq` is monotonic per `sessionId`.
4. Per-session ordering is preserved.
5. `terminal.watermark` is emitted first on subscribe.
6. Replay is best-effort bounded by ring-buffer retention.

## Replay model

Maintain an in-memory ring buffer per workspace in main process.

Suggested defaults:

1. `maxEvents`: 5,000
2. `maxBytes`: 4 MiB
3. `maxAgeMs`: 120,000

When `sinceEventId` is present:

1. Replay buffered events with `eventId > sinceEventId`.
2. If `sinceEventId` is older than retention, replay from oldest available and emit current `terminal.watermark`.
3. Do not terminate the stream for replay gaps.

## Main-process design

### New module

`apps/desktop/src/main/lib/terminal/workspace-stream-bus.ts`

Responsibilities:

1. Attach to runtime terminal events once.
2. Convert pane-scoped events into typed workspace events.
3. Maintain event ids, session seq counters, and replay buffers.
4. Expose subscribe/unsubscribe API used by tRPC router.

### Router

Add `terminal.streamWorkspace` in:

`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`

Implementation notes:

1. Use `observable` (required by `trpc-electron`).
2. Emit initial watermark.
3. Replay from `sinceEventId` before live events.
4. Unsubscribe cleanly on observable teardown.

## Renderer design

### Subscription location

Mount one workspace subscription in workspace-level UI, not per pane.

### Event fan-out

Use a small in-renderer dispatcher keyed by `paneId` to forward events to mounted terminals.

1. Terminal pane registers callbacks on mount.
2. Dispatcher sends matching events.
3. Unmounted panes are ignored without tearing down workspace stream.

## Migration (no feature flag)

1. Add workspace stream bus and `terminal.streamWorkspace`.
2. Switch renderer workspace view to a single workspace subscription.
3. Route events through dispatcher to existing terminal hooks.
4. Remove per-pane `terminal.stream(paneId)` call sites.
5. Delete legacy per-pane stream endpoint.

This can ship in one PR with sequential commits and continuous test runs.

## Failure handling

1. Stream parse or handler failure must not crash the subscription.
2. Missing pane listeners are valid (pane not mounted).
3. If renderer detects `eventId` regression, it logs and drops stale events.
4. If renderer detects per-session `sessionSeq` gap, it can request reattach/snapshot for that pane.

## Testing plan

1. Unit: event envelope builder increments `eventId` and `sessionSeq` correctly.
2. Unit: replay returns correct slice for `sinceEventId`.
3. Integration: subscription stays alive across `terminal.exit`.
4. Integration: two sessions in same workspace interleave safely, each session keeps ordered `sessionSeq`.
5. Integration: unsubscribe removes listener and does not leak references.

## Performance checks

1. Measure active subscription count before/after.
2. Measure main-process CPU during 4+ active panes with high output.
3. Measure renderer frame drops under sustained output.
4. Verify no increase in reconnect error rate.

## Follow-up (separate RFC)

Binary transport for terminal event channel can reuse this event contract directly by replacing JSON payload encoding only.

