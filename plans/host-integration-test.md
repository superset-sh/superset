# Host Integration Test

Status: **active; first package-boundary suite shipped, process/Node/mobile lanes remain**.

This plan is the focused test workstream for ACP sessions. The complete runtime,
packaging, persistence, state, and mobile backlog is in
`plans/acp-session-follow-ups.md`. Current behavior is documented in
`packages/host-service/docs/acp-sessions.md`.

## Goal

Test the same boundary a product client uses:

```text
@superset/host-client
  -> authenticated host-service HTTP and WebSocket server
  -> acpSessions router and stream route
  -> AcpSessionManager
  -> deterministic fake ACP adapter child
  -> temporary on-disk native transcript fixture
```

The always-run boundary suite at
`packages/host-service/test/integration/acp-host-client.e2e.test.ts` now proves
that the extracted host client and a real host server agree on procedure names,
SuperJSON envelopes, auth, output shapes, WebSocket cursors, and in-process host
restart behavior. The remaining work is a separate OS-process/Node lane and the
iOS product lane.

## Completed Prerequisites

- [x] `@superset/host-client` is extracted from mobile and owns generic
  fetch/SuperJSON transport, one-time 401 refresh, relay URL construction, and
  stream URL construction.
- [x] Mobile consumes `@superset/host-client` through
  `apps/mobile/lib/host/client.ts`.
- [x] The fake adapter is a real child process speaking ACP JSON-RPC over stdio
  through the official SDK.
- [x] Manager-level deterministic tests cover turns, tools, permissions,
  elicitations, cancel, crash, journal eviction, and session/load replay.
- [x] Router and WebSocket route tests cover feature gating, error mapping,
  fan-out, reconnect, and malformed `since` cursors.
- [x] A host-local SQLite registry maps the public session id to the native ACP
  session id and harness for restart resurrection.
- [x] The real `createApp` HTTP/tRPC host runs behind a relay-shaped prefix and
  is driven through `@superset/host-client` plus the real WebSocket sync client.
- [x] The boundary suite closes and reopens an on-disk registry, resurrects via
  `session/load`, and verifies the client-visible error/reset after deleting the
  harness-owned native transcript.

## Shipped Always-run Suite

The suite stays under `packages/host-service/test/integration/`. Keeping it with
host-service avoids a dev-dependency cycle from host-client back to the server
package.

It currently:

1. Create a temporary workspace and an on-disk host database.
2. Run host migrations through the normal test helper.
3. Start the real `createApp` server on an ephemeral port with the ACP feature
   enabled, the fake adapter injected, and production auth middleware active.
4. Construct the real `@superset/host-client` against that endpoint. The
   transport needs a direct-host URL mode or an in-process relay-shaped proxy;
   do not duplicate its serialization logic in the test.
5. Drive named client methods only. Assertions may inspect the temporary
   filesystem/database after a step, but must not invoke manager methods to
   advance the scenario. The shipped flow includes a question answer, an
   in-flight cancellation, simultaneous permissions, and cursor reconnect.
6. Shut down the whole server, close the database, and terminate adapter
   children.
7. Starts a fresh app/server/manager generation against the same DB/workspace
   paths and proves offline listing, on-demand `session/load`, history, stream
   attach, and client-visible load failure.

Still missing here: a separate OS process for the restarted host, the packaged
Node entrypoint with `better-sqlite3`, canonical output parsers, and the iOS
Maestro lane.

## Canonical Flow

1. `listSessions` returns `enabled: true` and no rows.
2. `createSession` returns idle/default-mode state and one registry row.
3. Two WebSocket clients attach to the same session.
4. A question prompt parks an interaction card; the client selects an answer
   and observes the completed turn on the stream.
5. A running tool is cancelled through the client and terminalizes once.
6. A prompt requests permission; both clients receive identical gapless frames.
7. One client answers. The other sees the same resolution and the turn ends.
8. `getMessages` pagination folds to the same timeline as the live stream.
9. One socket disconnects, more frames arrive, and cursor reconnect catches up
   without duplicates.
10. A tiny catch-up ring forces `journal_evicted`; full resync succeeds from the
   disk-backed history source once that workstream lands.
11. A 401 causes exactly one token refresh and retry. A second 401 surfaces.
12. The host is fully stopped and restarted from the same on-disk DB.
13. `listSessions` shows the session as offline without spawning an adapter.
14. Opening history or the stream resurrects the same native session.
15. A stale pre-restart cursor resets by journal incarnation.
16. A post-restart prompt completes and appends to the same history.

## Negative Cases

- feature gate disabled: `list` is disabled/empty, commands fail, stream route
  is absent, no child is spawned;
- invalid/expired auth over HTTP and WebSocket;
- session id bound to a different workspace;
- unknown session and malformed list/history/stream cursors;
- adapter fails initialize/new/load and exits during a turn;
- transcript missing or corrupt after registry lookup;
- host restart during a pending permission;
- wrong-session or malformed server output rejected by the real client;
- server close leaves no adapter process, socket, DB handle, or temp directory.

## Runtime Lanes

### Authenticated real-Claude lane (primary)

Use the real pinned `claude-agent-acp`, a real Sonnet model, and the machine's
existing Claude login in a throwaway git workspace. This is the primary
acceptance evidence for model/adapter behavior, not an optional smoke. Run it on
an authenticated Mac whenever ACP runtime, adapter/SDK, Workflow, permission,
question, cancellation, stream, reconnect, or resurrection code changes:

```bash
cd packages/host-service
ACP_E2E=1 ACP_E2E_MODEL=sonnet ACP_E2E_EFFORT=low \
  bun test \
    test/integration/acp-sessions.integration.test.ts \
    test/integration/acp-sessions-stream.integration.test.ts
```

The lane is not in ordinary CI yet because it needs a Claude login and spends
real tokens. Until a safe authenticated runner exists, the coding agent making
a relevant change is responsible for running it locally and reporting the
actual result.

### Always-run deterministic lane (belt and suspenders)

- fake adapter;
- no model, tokens, external network, or user credentials;
- Bun test runner for the broad matrix;
- a Node lane for the production `better-sqlite3` driver and packaged host
  entrypoint.

This lane is valuable for broad matrices, exact fault injection, and fast CI
feedback. It is not evidence that the real Claude adapter/model still behaves
the same way, and it never substitutes for the authenticated lane.

### iOS product lane

Maestro starts from the mobile session list and talks through the relay to the
same test host. Cover create, permission, reconnect/background, host restart,
offline row, resume, older-page loading, and load failure. Relaunch the app
during restart scenarios so the result cannot pass through retained React
state.

## Contract Ownership

The current `@superset/session-protocol` package mixes contracts, sync logic,
and React hooks. The planned split is:

- `@superset/host-service-sync`: schemas, types, fold, cursors, WebSocket sync,
  framework-free store;
- `@superset/host-service-react`: React bindings;
- `@superset/host-client`: transport and named host clients.

The integration suite should consume named operations with output parsers from
`host-service-sync`; it must not import the host's full `AppRouter` into mobile
or hand-maintain a second response facade.

## Acceptance

- The complete canonical flow passes through a real server and real
  `@superset/host-client`.
- Restart closes and reopens an on-disk DB in a new host process.
- Bun and Node/`better-sqlite3` lanes pass.
- The authenticated real-Claude suites pass on a Mac after every relevant
  ACP/runtime change.
- Malformed outputs fail at the client parser, not later in the fold/UI.
- Teardown leaves no process, socket, file handle, or temporary directory.
- The deterministic backup remains always-run and requires no cloud services.
