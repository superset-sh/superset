# Sidebar "Last updated" sort: activity signal design

Status: shipped with the re-land of the sidebar filter/sort feature
(`reland-sidebar-sort-filter`, reapplying #5956 after revert #5996).
Covers what signal drives the "Last updated" sort, why, the current
polling implementation, and the alternatives considered — including the
ones that are "more correct" and what it would take to move to them.

## The problem

The dashboard sidebar offers three sort modes for projects and their
workspaces: manual, date created, and last updated. The first shipped
version of "Last updated" sorted on `v2_workspaces.updatedAt` and had
two defects, one crash and one semantic:

1. **Crash**: rows reaching the sidebar through the Electric cloud
   fallback carry ISO **strings** in `updatedAt`/`createdAt` at runtime
   (the Electric client's default parser handles int/bool/float but not
   `timestamptz`, and we pass no custom `parser`), while the Drizzle
   `SelectV2Workspace` type claims `Date`. `workspace.updatedAt.getTime()`
   threw and took the whole sidebar down for anyone with remote
   workspaces. Host-served rows are unaffected (superjson revives real
   `Date`s over tRPC).
2. **Semantics**: the host only writes `v2_workspaces.updatedAt` on
   metadata patches — rename, PR linkage, branch changes. Sending an
   agent a message never touches it, so the one thing "Last updated"
   obviously should respond to didn't reorder anything. This is what got
   the feature reverted.

## What "activity" means now

The host-service already tracks exactly the signal we want. Every agent
hook event POSTs to `notifications.hook`, which normalizes the event
(`UserPromptSubmit`/`PostToolUse` → `Start`, `Stop`/turn-complete →
`Stop`, `PreToolUse`/`Notification` → `PermissionRequest`, session
start/end → `Attached`/`Detached`, agent-agnostic across
Claude/Codex/OpenCode/Grok) and records it on the terminal's agent
binding as `lastEventAt` (epoch ms, persisted in the host's SQLite via
`terminal-agents/persistence.ts`, so it survives host restarts). The
same feed drives the sidebar working/idle status dots.

A workspace's effective activity timestamp is:

```
max(updatedAt, newest lastEventAt across the workspace's agent bindings)
```

so metadata updates still count, and both directions of a conversation
count (prompt submit bumps immediately; tool use and turn completion
keep bumping). Things that intentionally do **not** count: plain
(non-agent) terminal typing, and merely viewing a workspace.

Sorting applies the effective timestamp at every level, stably
(name → id tie-breaks), with NaN-safe coercion for the string-date rows:

- workspaces within a project and within sections
  (`sortDashboardSidebarProjectChildren`),
- sections rank among loose workspaces by their newest member,
- the local main workspace stays pinned first,
- projects rank by their most-active workspace
  (`getProjectActivityTimestamp`).

## Current implementation: per-host polling

`useDashboardSidebarData` reuses the pull-request query targets (one
entry per reachable host, local or relay-routed) and runs one
react-query per host against `terminalAgents.list`:

- `enabled` only while the sort mode is `"updated"` — manual/created
  users generate zero extra traffic;
- `refetchInterval: 10_000`;
- results collapse into `Map<workspaceId, newest lastEventAt>`,
  JSON-fingerprinted for stable identity, then threaded onto each
  `DashboardSidebarWorkspace` as `lastAgentActivityAt` by the builders.

Properties:

- **Latency**: 0–10s from agent event to reorder. Measured live: a
  synthetic `UserPromptSubmit` moved an idle workspace to the top of its
  project in ~4s.
- **Cost**: one cheap host round-trip per host per 10s, only while the
  mode is active and the window focused (react-query pauses intervals in
  background, refetches on focus).
- **Failure mode**: an unreachable host contributes nothing; its
  workspaces fall back to `updatedAt`. Nothing crashes, order degrades
  gracefully.

Why polling first: it's stateless, self-healing by construction, and
identical in shape to the adjacent PR-status queries, so it was the
lowest-risk way to re-land a previously-reverted feature. The latency is
its only real cost.

## Alternative 1 (recommended next): event-bus push + slow-poll self-heal

The renderer already holds a WebSocket to each host's event bus (it
powers the status dots), `notifications.hook` broadcasts
`agent:lifecycle` on that bus *before* it writes the store, and the bus
client supports wildcard subscriptions — `bus.on("agent:lifecycle", "*",
cb)` receives events for every workspace on the host over the existing
connection.

Design:

- one `"*"` listener per reachable host; on event, patch the activity
  map in place via `queryClient.setQueryData` (the payload carries
  `workspaceId` + `occurredAt` — no refetch round trip needed);
- keep the poll as reconciliation at a long interval (~60s) plus the
  default refetch-on-focus, to catch events missed while a WS was down
  (host restart, laptop sleep). Pure push with no reconciliation drifts
  silently — `useTerminalAgentBindings` documents exactly this failure
  mode and uses the same event+staleTime hybrid one level down.

Result: effectively instant reordering with *less* steady-state traffic
than the 10s poll. Contained change inside `useDashboardSidebarData`.
The only reason it isn't in the initial re-land is sequencing: land the
proven-simple version first.

## Alternative 2 (most correct long-term): persist activity to the cloud

Both approaches above only rank hosts you can currently reach. The
fully correct model is server-side: the host (already the writer of
workspace rows) debounce-bumps a `lastActivityAt` column on
`v2_workspaces` (or a small activity table) on agent events, and
Electric pushes it to every device reactively — this is arguably what
`updatedAt` should have meant all along.

Gains: cross-device correctness (see that your desktop at home is busy,
from your laptop), offline-host ranking from last-known cloud state, no
renderer fan-out at all.

Costs / open questions, which is why it's deferred:

- write volume: agent events are chatty; needs debouncing (e.g. ≥30s
  per workspace) and an answer for hosts that are offline mid-burst;
- schema + API surface: a migration, host write path, and backfill;
- it must *not* be conflated with `updatedAt`, or every activity bump
  looks like a metadata edit to other consumers;
- the Electric string-date issue applies to any new timestamp column:
  either fix the missing `parser` in our shape options first, or the new
  column arrives as strings too and every consumer needs coercion.

If/when this lands, the renderer side collapses: the sort reads
`max(updatedAt, lastActivityAt)` straight off the row and both the poll
and the push wiring get deleted.

## Alternatives rejected

- **`chat_sessions.lastActiveAt`** (cloud table, Electric-synced, has
  `v2WorkspaceId`): only chat panes write it. Terminal agent panes — the
  dominant way people talk to Claude in v2 — never touch it.
- **Local interaction tracking** (bump a localStorage timestamp when the
  user opens/messages a workspace): per-device only, misses the
  "agent finished while I was elsewhere" bump entirely, and adds a
  second source of truth next to the host's binding store.
- **Faster polling**: trivially shrinks latency but scales traffic
  inversely and still isn't instant; strictly dominated by push.

## Known limitations of the shipped version

- 0–10s reorder latency (see Alternative 1).
- Unreachable hosts fall back to `updatedAt` ranking.
- Pinned rows keep pin order — the Pinned section ignores sort modes by
  design.
- A messaged workspace ranks by newest event, it does not pin to #1: an
  agent actively working elsewhere (its `PostToolUse` events keep
  bumping) can legitimately out-rank it moments later.
- The `SelectV2Workspace` string-vs-`Date` type lie is still only
  patched at the sidebar entry points (`mergeHostWorkspaces`
  normalization + NaN-safe `toTime` in the sort). The root fix — an
  Electric `parser` for timestamp columns in the shared shape options —
  is intentionally out of scope here because it changes runtime types
  for every consumer of every Electric collection and needs its own
  audited PR. Note that persisted IndexedDB snapshots written before
  that fix will still contain strings, so defensive coercion in sort
  paths stays necessary regardless.
