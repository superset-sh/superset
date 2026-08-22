# ACP Session Follow-ups

Status: **active**. Current implementation behavior is documented in
`packages/host-service/docs/acp-sessions.md`. This plan contains only remaining
work and completed prerequisites that explain the next boundaries.

## Decisions

1. The in-memory journal is a recent delivery/catch-up buffer, not the long-term
   history source.
2. Older history pages must come from disk. Do not increase the ring to make
   long sessions appear durable.
3. Keep `@superset/host-client` as the platform-neutral relay/direct transport.
4. Replace the mixed `@superset/session-protocol` package with two packages:
   `@superset/host-service-sync` and `@superset/host-service-react`. Do not add a
   third `host-service-protocol` package.
5. Runtime data crossing a process, network, persistence, or untyped JSON
   boundary must be parsed. TypeScript assertions are not validation.
6. Authenticated real-Claude tests are the primary acceptance evidence for the
   model/adapter boundary and must run on a Mac after relevant changes. The
   deterministic fake adapter stays always-run as belt-and-suspenders breadth;
   it does not replace the real adapter/model or real host/client boundaries.

## Current Gaps

### History And Memory

The host ring is bounded at 5,000 envelopes, but `getMessages` currently pages
that same ring. `session/load` can rebuild it after a restart by replaying the
whole native transcript, but ACP exposes no paginated native-history method.
Once the transcript is larger than the ring, the oldest frames are not
available through Superset.

The React hook also keeps every fetched page and live envelope in
`envelopesRef` so it can refold from scratch. It removes superseded state frames,
but there is no general live-buffer cap. This is bounded by what the user has
loaded plus the current mount's live stream, not by the full on-disk transcript.

### Validation

The code is strongly typed at compile time but not fully runtime validated:

- ACP `ContentBlock` and permission outcomes use shallow `z.custom` checks.
- the generic host transport lets the caller choose `TOutput` and asserts the
  deserialized relay response;
- the WebSocket guard checks only `seq` and `frame.kind`;
- adapter response payloads and persisted registry rows are trusted;
- tRPC procedures do not declare output schemas;
- test fixture files are outside the host-service package typecheck.

### Cursor Incarnations

Sequence numbers restart after host resurrection. There is no persisted
journal incarnation in the cursor, so an old numeric cursor can overlap the new
range and be mistaken for a current cursor.

## Workstreams

### P0: Disk-backed history, bounded catch-up

- [ ] Define `SessionHistoryStore` with append, replace-from-native-replay, and
  newest-first page operations. It must be adapter-neutral at the manager
  boundary.
- [ ] Choose the on-disk representation after measuring payload size. Prefer an
  append-only host-local store with indexed session/order columns; do not store
  folded UI state.
- [ ] Document retention, permissions, deletion, and corruption recovery before
  storing message/tool payloads in host SQLite or another host-owned file.
- [ ] During `session/load`, write the full replay to a temporary generation and
  atomically replace that session's history only after load succeeds. A failed
  load must preserve the previous readable generation.
- [ ] Keep only the newest catch-up window in `SessionJournal`. Set the cap from
  an explicit event/byte policy after measurement; 5,000 is not a product
  requirement.
- [ ] Make `getMessages` page `SessionHistoryStore`, never `SessionJournal`.
- [ ] Keep state/reset frames out of history pages while retaining all timeline
  frame kinds required to reconstruct permissions, plans, tool calls, and prompt
  failures.
- [ ] Add a journal incarnation id to state, stream cursors, and history page
  cursors. A cursor from another incarnation must deterministically reset.
- [ ] Bound `earlyUpdates` during `session/load`; write replay rows incrementally
  instead of accumulating the full replay array before runtime creation.
- [ ] In `host-service-sync`, retain loaded history pages and a bounded live
  overlay. Do not retain evicted catch-up envelopes merely to support refolding.
- [ ] Prove a transcript larger than every in-memory cap can page to its first
  message after host restart while host and client memory remain bounded.

Acceptance:

- `getMessages` can read old pages with no live adapter process;
- shrinking the catch-up ring does not shrink available history;
- restart/load never exposes a partially rebuilt history generation;
- stale cursors always reset by incarnation, not by numeric coincidence;
- no message content is uploaded to cloud storage.

### P1: Strict runtime contracts

- [ ] Put canonical Zod schemas for every Superset-authored state, frame,
  envelope, cursor, and page in `@superset/host-service-sync`.
- [ ] Replace shallow `z.custom` schemas with explicit supported ACP content and
  outcome schemas. Preserve official extension points as `unknown` or JSON-safe
  records only where the protocol requires them.
- [ ] Decide how to validate full ACP payloads: compile validators from the
  SDK-exported JSON Schema, vendor generated validators, or validate the exact
  supported union locally. Record the version-skew policy.
- [ ] Parse all tRPC outputs in `@superset/host-client`; remove caller-selected
  unchecked `TOutput` from named ACP operations.
- [ ] Parse complete WebSocket envelopes, enforce expected `sessionId`, safe
  integer sequences/timestamps, and known discriminants before folding.
- [ ] Parse adapter initialize/new/load/prompt/config responses before use.
- [ ] Derive the registry row type from Drizzle and parse rows read from SQLite.
- [ ] Add database constraints for harness/status-like fields and workspace
  ownership where compatible with host cleanup semantics.
- [ ] Include host-service test fixtures in a strict test tsconfig.
- [ ] Add malformed input/output/frame/row tests for every trust boundary.

Acceptance: no network, child-process, JSON, or SQLite payload reaches business
logic through an unchecked assertion.

### P2: Real host plus real host client E2E

Completed:

- [x] Extract generic transport to `@superset/host-client` and consume it from
  mobile.
- [x] Add a deterministic fake ACP adapter that speaks real ACP JSON-RPC over
  stdio.
- [x] Cover manager, router, and WebSocket behavior directly.
- [x] Start the real `createApp` host on an ephemeral port with the production
  auth middleware, a temporary on-disk registry, and the fake adapter.
- [x] Drive named operations through `@superset/host-client`, including
  SuperJSON, bearer auth, tRPC routing, WebSocket URL construction, concurrent
  permissions, an `AskUserQuestion` answer, an in-flight cancellation, cursor
  reconnect, and load-error propagation. The transport unit suite separately
  pins 401 refresh-once.
- [x] Close and rebuild the app, HTTP/WS server, adapter children, and SQLite
  handle against the same DB path; prove offline listing, resurrection, replay,
  and missing-native-transcript behavior.
- [x] Add an authenticated real-adapter lane using a throwaway workspace,
  Sonnet/low by default, and the machine's Claude login. Captured cases cover a
  completed five-agent Workflow, `AskUserQuestion`, serialized parallel-tool
  permissions, cancel mid-turn, real WebSocket fan-out, reconnect, and reset.
  This is the primary compatibility lane; it is skipped in ordinary CI only
  because CI lacks Claude credentials and the run spends real tokens.

Remaining:

- [ ] Move restart into a separate OS host process and prove kill/respawn, not
  only fresh app/server/manager instances inside one Bun test process.
- [ ] Run a Node lane with production `better-sqlite3`, not only `bun:sqlite`.
- [ ] Keep the suite package-boundary-safe: tests should not import manager
  internals to make assertions that a real client cannot make.

The focused test design remains in `plans/host-integration-test.md`.

### P3: Package split

Target ownership:

```text
@superset/host-client
  fetch/SuperJSON transport, auth retry, direct/relay URL construction,
  named host-service clients

@superset/host-service-sync
  ACP/Superset wire types, Zod validators, cursors, pure fold/reducer,
  WebSocket reconnect/dedup/reset logic, framework-free session store

@superset/host-service-react
  useHostServiceSession, permission selectors, lifecycle/GC bindings;
  depends on host-service-sync and React, contains no transport implementation
```

- [ ] Create `host-service-sync` from the non-React parts of
  `session-protocol`.
- [ ] Create `host-service-react` from `session-protocol/src/react`.
- [ ] Move the per-session state owner out of one component hook and expose a
  vanilla store factory so multiple React consumers share one subscription.
- [ ] Keep app-specific auth/routing injection in mobile/desktop bindings.
- [ ] Migrate host-service, host-client, and mobile imports.
- [ ] Delete `@superset/session-protocol` after the migration; do not leave
  compatibility re-exports indefinitely.
- [ ] Add package boundary tests proving `host-service-sync` has no React, Node,
  Expo, or host-service runtime dependency.

### P4: Client state management

Do not copy the current desktop chat implementation exactly. The current v2
desktop chat hook polls a full `getSnapshot` at 4 fps through TanStack Query and
keeps full message history in the query cache with a 60-second inactive GC. It
is not a reusable streaming session store. The Zustand event-store design in
`plans/v2-chat-greenfield-architecture.md` is proposed, not implemented.

Reuse the useful desktop conventions instead:

- one vanilla store instance per open session;
- explicit acquire/release ownership and short inactive GC;
- serializable state separated from sockets, promises, and callbacks;
- selectors so a status chip does not rerender the whole timeline;
- optimistic command state reconciled by authoritative stream events;
- app-owned pane/tab persistence, not session-sync-owned navigation state.

- [ ] Prototype the store in `host-service-sync` and React bindings in
  `host-service-react`.
- [ ] Compare memory and render counts against the current hook with a long
  synthetic transcript.
- [ ] Prove two mounted consumers of one session use one socket and converge.
- [ ] Prove unmount/remount inside the GC window reuses state; after GC it cold
  loads only the newest page.
- [ ] Keep desktop pane layout and mobile navigation out of the shared store.

### P5: Registry lifecycle

Completed in the current implementation:

- [x] Add a host DB table mapping public session id to workspace id, native ACP
  session id, harness, cwd, title, stop reason, and timestamps.
- [x] Load rows as passive offline sessions and resume through `session/load`.
- [x] Keep transcript content out of the registry row.

Remaining:

- [ ] Add explicit delete/forget semantics, including native-session deletion
  behavior and history-store cleanup.
- [ ] Remove or quarantine rows whose workspace no longer exists.
- [ ] Define retention/GC for abandoned, load-failed, and dead sessions.
- [ ] Support additional harness values only with an adapter registry and
  harness-specific resume/history capabilities.
- [ ] Validate cwd/workspace ownership on every resurrection; do not trust a
  stale stored path if the workspace moved.

## E2E Edge-case Matrix

Every row needs a deterministic fake-adapter case. Rows marked `boundary` also
need the host plus `@superset/host-client` suite. User-visible rows need an iOS
Maestro scenario.

### Session lifecycle

- [ ] create idempotency under concurrent calls (`boundary`)
- [ ] same public id with another workspace is rejected (`boundary`)
- [ ] adapter fails before initialize, during new, and immediately after new
- [ ] adapter exits idle, streaming, awaiting permission, and during load
- [ ] host exits idle, streaming, awaiting permission, and while persisting
- [ ] on-disk DB close/reopen plus host process respawn (`boundary`, Maestro)
- [x] native transcript missing (`boundary`); corrupt, truncated, and access
  denied remain
- [ ] workspace deleted or moved before resurrection
- [ ] delete/forget races with attach and prompt

### Stream and pagination

- [ ] disconnect before first frame, mid-frame, mid-turn, and after turn end
- [ ] duplicate, missing, out-of-order, malformed, wrong-session, and unknown
  frame variants (`boundary`)
- [ ] stale cursor from another incarnation (`boundary`)
- [ ] journal eviction before attach and while a subscriber is slow
- [ ] WebSocket back-pressure close followed by cursor recovery
- [ ] JWT expires before connect and during reconnect (`boundary`)
- [ ] relay unavailable, reconnect backoff, and host tunnel replacement
- [ ] history larger than ring, page size, and client memory cap
- [ ] concurrent `loadOlder`, reset, refresh, and route/session switch
- [ ] empty history, exact page boundary, final partial page, invalid cursor

### Commands and interactions

- [ ] two prompts admitted concurrently and prompt queued mid-turn
- [ ] prompt request rejected before and after user-message persistence
- [ ] permission allow/deny racing cancel, adapter abort, and another client
- [ ] invalid request id, invalid option id, invalid multi-select cardinality
- [x] multiple simultaneous permissions and ordered question cards
- [x] single-select, multi-select, skip, arbitrary unsupported form, URL mode
- [ ] set mode/config idle, mid-turn, during load, and from two clients
- [x] cancel running and awaiting permission
- [ ] cancel idle, twice, and after death
- [ ] tool calls left open by cancel/crash/restart terminalize once

### Security and privacy

- [ ] feature gate off mounts no stream route and spawns no adapter (`boundary`)
- [ ] cross-user/org/host/workspace access is denied (`boundary`)
- [x] ambient Anthropic credentials never enter the adapter child
- [ ] auth tokens never appear in logs, errors, persisted rows, or snapshots
- [ ] registry contains no message/tool/permission bodies
- [ ] history retention/delete inspection proves removed content is absent

### Mobile

- [ ] first load, empty, disabled, offline, dead, and load-failed list states
- [ ] background/foreground longer than token lifetime (`Maestro`)
- [ ] host restart while thread is open (`Maestro`)
- [ ] scroll to first on-disk page while live updates continue (`Maestro`)
- [ ] two devices answer the same permission; loser reconciles correctly
- [ ] network loss during prompt, permission response, and pagination
- [ ] long text/tool output, large plans, and all supported content blocks

## Completion Gates

- `bun run lint` exits 0 with no warnings.
- `bun run typecheck` exits 0, including test fixtures.
- Focused package tests pass under Bun and the Node/`better-sqlite3` lane.
- The real host plus real host-client suite passes with an on-disk restart.
- The documented memory caps are measured with a transcript beyond those caps.
- Current implementation docs and the PR description match the code without
  historical behavior mixed into the current-state section.
