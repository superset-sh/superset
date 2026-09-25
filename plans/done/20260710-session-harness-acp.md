# ACP Session Harness

Status: **implemented**. Current runtime behavior is maintained in
`packages/host-service/docs/acp-sessions.md`. Remaining hardening and
architecture work is tracked in `plans/acp-session-follow-ups.md`.

## Outcome

Superset has an off-by-default ACP session path alongside the existing Mastra
chat runtime:

- host-service owns one `claude-agent-acp` child per active session;
- clients use authenticated tRPC commands and a sequence-numbered WebSocket;
- mobile can list, create, open, prompt, cancel, select mode/model/effort, answer
  permissions, and answer option-based questions;
- a host-local SQLite registry preserves the public/native session binding;
- after a host restart, sessions list as offline and resume on demand through
  ACP `session/load`;
- the existing Mastra runtime remains untouched;
- desktop exposes the security setting but does not consume the ACP UI yet.

## Implemented Packages

### `packages/host-service`

`AcpSessionManager` owns adapter process lifecycle, session-scoped state,
pending interactions, a bounded sequence journal, subscribers, and registry
persistence. The `acpSessions` tRPC router exposes list/create/get/history and
command procedures. `/acp-sessions/:sessionId/stream` provides cursor replay
and live fan-out.

The host removes ambient Anthropic API credentials at the adapter spawn site so
the child uses the host user's Claude login. New and loaded sessions are forced
out of `bypassPermissions` unless the user selected another non-bypass mode.

### `packages/session-protocol`

The package exports ACP types, Superset state/envelope contracts, router input
schemas, cursor helpers, the pure timeline fold, a reconnecting WebSocket sync
client, and React hooks. The package split into `host-service-sync` and
`host-service-react` remains follow-up work.

### `packages/host-client`

The platform-neutral host transport owns fetch/SuperJSON calls, one-time 401
refresh, relay HTTP/WS URL construction, and the named ACP client. Mobile only
injects Expo environment and auth token providers.

### `apps/mobile`

The ACP route is separate from the Mastra session route. It renders streamed
messages, thoughts, tool calls, plans, permission resolution, question cards,
composer controls, loading/error states, and offline/dead session rows.

### `apps/desktop`

Settings -> Security contains the default-off live-agent-session toggle. The
coordinator passes `SUPERSET_ACP_SESSIONS=1` to a restarted host child when the
setting is enabled.

## Persistence

The host database stores one `acp_sessions` registry row containing the public
session id, workspace id, native ACP session id, harness, cwd, title, stop
reason, and timestamps. It does not store conversation content.

On host startup, rows become passive `offline` states. `getMessages`, stream
attach, or any command calls `ensureLive`, which starts an adapter and uses
`session/load`. The adapter replays its native on-disk transcript into a fresh
bounded journal before the session accepts new work.

In-flight work and pending process-local interactions do not survive restart.
Open tool calls recovered from a completed replay are terminalized.

## Delivery Contract

Within one host runtime incarnation, envelopes have a gapless per-session
sequence. The stream replays `(since, latest]` before attaching live. Clients
deduplicate repeated sequences, reconnect on gaps, and perform state/history
resync when the server reports an unservable cursor.

The in-memory journal is capped at 5,000 frames. It currently serves both recent
catch-up and `getMessages`, so history beyond the retained window is not
available. Separating disk-backed history from the catch-up ring is required
follow-up work.

## Feature Gate

- Disabled is the default.
- Disabled hosts do not mount the ACP stream route.
- Disabled hosts reject every ACP procedure except `list`.
- `list` returns `enabled: false` and no rows, so mobile discovers capability
  without an additional request.

## Verification Delivered

The deterministic fake adapter speaks ACP JSON-RPC over stdio through the
official SDK. Always-run tests cover:

- multi-turn streaming and timeline folding;
- two subscribers and cursor reconnect;
- history/list pagination and malformed cursors;
- tool calls and prompt rejection;
- permission allow/deny and first-answer-wins behavior;
- single/multi-question elicitations, skip, and unsupported forms;
- cancellation and adapter crash;
- mode/config updates and credential scrubbing;
- journal eviction reset;
- registry loading, offline state, session/load replay, load failure, stream
  resurrection, and router resurrection.

The implementation was also exercised through a local relay and iOS simulator
during development. Those scratch flows are not a checked-in, always-run mobile
suite.

## Known Limits At Completion

- Runtime schemas are not complete at every network/JSON/SQLite boundary.
- The host-client has no full host-server package-boundary E2E test.
- Persistence tests use a fresh manager over one in-memory SQLite handle, not a
  killed/restarted host process with a closed/reopened on-disk DB.
- Sequence cursors do not include a journal incarnation.
- The ring is still the only host-readable history page source.
- The client orchestration is held in a React hook rather than a shared
  framework-free session store.
- Rich adapter-specific semantics such as native task graphs, workflows,
  subagent prose, and goals are flattened or absent on the ACP wire.

All of these are explicit workstreams in `plans/acp-session-follow-ups.md`.