# Host Sessions Sync

Status: **v1 — implemented on `feat/sessions-v1-simplified-api`, in team
review.** This is the single source of truth for the host sessions surface:
the protocol spec (three review layers), rollout state, and the E2E user
story the suites assert against. It supersedes the previous wider protocol
draft and the separate rollout doc; everything cut was implemented and
tested first, so the cuts are deliberate removals of speculation, not
unbuilt wishes.

The spec is structured as three review layers. Layer 1 is the pitch — read
it alone to judge the approach. Layer 2 is the design — state ownership, the
exact surface, recovery, testing. Layer 3 is one realistic end-to-end
scenario with exact payloads. Rollout and the user story close the doc.

---

## Layer 1 — Principles and approach

One host process per machine runs coding-agent sessions through vendor
harnesses (Claude Code today, more later). Phones and desktops are thin
replicas: they render state the host owns and submit intents. The protocol
between them is deliberately small:

**Budgets (hard):** 9 tRPC procedures · 12 socket packet types · 2 cursor
kinds · 1 automatic recovery path + 1 human hammer.

1. **The event log is the only truth in motion; everything else is a
   projection.** The host folds vendor output into canonical events; host
   and client run the *same* pure reducer over them. No second state
   machine to drift.
2. **Mutations acknowledge admission, not completion.** Every mutation
   carries an idempotent `requestId` and returns a receipt; the outcome
   arrives later as events whose `causationId` echoes the request. Retries,
   double-taps, and races between devices are absorbed by receipts —
   first write wins, losers get a clean stale error.
3. **Big payloads ride tRPC; the socket carries only small frames.**
   Snapshots (session list, session state) are tRPC query responses. The
   WebSocket carries individual events, acks, and control frames — nothing
   that grows with session size.
4. **Cursors are opaque and incarnation-tagged.** Clients store and return
   them verbatim, never parse or compare. A cursor from a dead log
   generation fails loudly (`reset`) instead of silently misaligning.
5. **Recovery is the cold path, not a special mode.** `reset` on a stream
   triggers exactly what first-connect does: tRPC snapshot → subscribe from
   its head. There is no separate resync state machine. When the host
   itself is wedged, the existing desktop "restart host" button is the
   answer — sessions re-hydrate from durable state; we add no intermediate
   per-session recovery procedures.
6. **Harness-agnostic entities.** Canonical `Message`/`ContentBlock`/
   `ToolCall`/`Thread` shapes — not AI-SDK or ACP types — so the same wire
   serves the ACP adapter today and a direct Claude SDK adapter next
   without client changes.

### Trajectory: one host control plane, terminals stay separate

This is **host-level sync, not session-level sync** — sessions are just the
first domain riding it.

- **One control socket per host.** The host stream on `/sessions/sync` is
  the host's control plane: small, ordered, cursor-replayable events for
  everything the host owns. Today that is session/permission lifecycle;
  workspace lifecycle (created/deleted/renamed), host status, and agent
  availability join as new host-stream event types plus matching tRPC
  snapshot procedures — never as new sockets or a second sync machine.
- **Terminal sync is a different animal and stays out.** Terminals are a
  throughput/data plane — raw PTY bytes, latency-sensitive, tolerant of
  loss on reconnect — already served by the dedicated `/terminal/*` path.
  Control and data planes never share a socket: a busy terminal must not
  head-of-line-block a permission card, and PTY bytes must never pay the
  event-log/cursor/replay overhead built for control events.
- **The client store extends the same way.** The vanilla zustand store is
  already host-scoped (one replica per host: connection, host stream,
  `sessionsById`, per-session streams). New domains land as sibling slices
  folded from the same host stream by the same reducer pattern — one
  socket, one cursor discipline, one store per host.

### Testing approach

- **Validation spine:** one scripted "gym" user story (streaming, interrupt,
  permission cards, always-allow, multi-select questions, subagent,
  workflow, parallel sessions) replayed over every execution surface:
  (1) the shipping ACP surface, (2) this protocol with a real model,
  (3) the direct SDK adapter, (4) a phone via Maestro. Same story, four
  wires — divergence is a bug by definition.
- **Deterministic fakes for the nasty parts:** a scripted fake ACP adapter
  (real JSON-RPC over stdio, no model) drives restart/crash/eviction
  scenarios in milliseconds inside `bun test`.
- **Stress oracles:** the sync hub runs a randomized multi-client
  drop/reconnect/eviction storm; an oracle asserts byte-parity between what
  the host holds and what every client converged to.
- **Adversarial review loop:** every protocol invariant that survives review
  (internal + external AI reviewers + second-opinion codex runs) becomes a
  Zod `superRefine` the host enforces at runtime on inputs *and* outputs —
  the contract is executable, not prose.

---

## Layer 2 — Design

### Where real state lives

```
 clients (N per user)              host (1 per machine)                vendor harness
┌─────────────────────┐  tRPC   ┌────────────────────────────┐  ACP  ┌──────────────────┐
│ sync client store   │───────► │ sessions.* router          │─────► │ adapter child    │
│ (zustand replica,   │ muts +  │ CanonicalSessionsRuntime   │       │ (1 per live      │
│  DISPOSABLE)        │ snaps   │  · event log (RAM ring)    │ ◄──── │  session)        │
│                     │         │  · projection              │replay │                  │
│                     │ ◄────── │ SyncHub (cursors, streams) │       │ transcript JSONL │
└─────────────────────┘  WS     │ SQLite registry (DURABLE)  │       │ (DURABLE, vendor │
        /sessions/sync  events  └────────────────────────────┘       │  owns it)        │
                                                                     └──────────────────┘
```

| Store | Durability | Owns | Rebuilt from |
|---|---|---|---|
| SQLite registry (host) | survives host death | which sessions exist: id → workspace, native session id, harness | — (truth) |
| Vendor transcript (`~/.claude/...` JSONL) | survives host death | conversation content | — (truth) |
| Host RAM: canonical event log (ring, 5k events/session) + projection | dies with host | live event stream, cursors, pending cards | registry + vendor replay (`session/load`) |
| Client store | disposable | rendered replica | tRPC snapshot + WS replay |

The invariant that keeps recovery simple: **every layer is rebuildable from
the layers to its right.** Nothing a client holds is ever authoritative;
nothing in host RAM is unrecoverable.

### Control flow (high level)

```
COLD PATH (= first connect, = reconnect after reset, same code):
  tRPC sessions.list()  ──► sidebar state + host-stream head cursor
  tRPC sessions.get(id) ──► session snapshot + session-stream head cursor
  WS   subscribe(after: head) ──► subscribed → replay gap → caughtUp → LIVE

LIVE:
  user intent ──► tRPC mutation (requestId) ──► receipt (admission)
  outcome     ──► WS events (causationId = requestId) ──► reducer ──► UI

RECOVERY:
  stream reset  ──► re-run cold path for that one stream (others untouched)
  reset loop    ──► circuit breaker: stream status = error, stop, surface to UI
  host wedged   ──► human presses "restart host" (existing desktop feature)
                    registry survives → sessions listed as offline
                    first live mutation → spawn adapter → session/load replays
                    transcript from vendor disk → canonical log rebuilt
```

### tRPC surface — 9 procedures

All wire identifiers (packet types, event types, enum values) are
**camelCase**. Every mutation input carries `requestId`; receipts are
admission-acks.

| Procedure | Shape |
|---|---|
| `list` → **host snapshot** | `{} → { sessions: Session[], pendingPermissions: PermissionRequest[], openClientToolCalls: ToolCall[], head: Cursor \| null }` — all non-archived sessions, **no paging**. Ungated capability probe: gated-off hosts return empty arrays, `head: null`. |
| `get` → **session snapshot** | `{sessionId} → { session, threads[], activeTurns[], pendingPermissions[], openToolCalls[], recentEvents[], hasOlderEvents, head }` — `recentEvents` is a ≤ 50 tail ending exactly at `head`; `hasOlderEvents` tells the client whether `getEvents` paging has anything to fetch |
| `create` | `{requestId, workspaceId, agentId, title, settings} → {session, mainThread}` |
| `update` | `{requestId, sessionId, title?, archived?, settings?}` — one patch mutation for title/archive/model/mode/effort (absent = unchanged) |
| `getEvents` | `{sessionId, threadId?, beforeCursor?, limit ≤ 100} → EventsWindow` — **backwards-only** scrollback; no cursor = newest window |
| `submitTurn` | `{requestId, sessionId, threadId, content: ContentBlock[]} → {status: "accepted", turnId}` |
| `cancelTurn` | `{requestId, sessionId, turnId} → receipt` |
| `resolvePermission` | `{requestId, sessionId, permissionId, outcome}` — first write wins |
| `resolveToolCall` | `{requestId, sessionId, toolCallId, outcome}` — client tools (`ask_user`); **no claims**: the card renders on every device, first resolve wins, others drain via events |

`EventsWindow`: `{ items ≤ 100 ascending, range: { oldest, newest,
hasMoreBefore, truncatedBefore }, head }`. Boundaries are full
`{eventId, cursor, occurredAt}` triples, schema-verified against the actual
first/last items. `truncatedBefore: true` = older history existed but the
ring lost it (goes away with the durable store).

### Sync socket — 12 packet types, all small

client → `hello` (protocolVersion, clientInstanceId, toolResolvers),
`subscribe` (subscriptionId, stream, **after: Cursor — required**),
`unsubscribe`, `toolResolversChanged`, `ping`

server → `helloAck` (hostId, connectionId), `subscribed`, `event`,
`caughtUp`, `unsubscribed`, `reset` (code, recovery), `error`, `pong`

There are **no snapshot packets**. `subscribe.after` always comes from a
tRPC response (`list`/`get`/`getEvents` all return `head`). Subscribing with
an unservable cursor yields `reset`, and the client re-runs the cold path.

The hot-path frame is `event`: ~250–600 bytes typical. The only bounded
exception: tool-call `rawInput`/`rawOutput` up to the 256 KB cap (oversize
values are dropped to `null` at translation, never truncated mid-JSON).

Events:
- **host stream (6):** `sessionUpsert`, `sessionRemoved`,
  `permissionAvailable`, `permissionResolved`, `clientToolCallAvailable`,
  `clientToolCallResolved`. All are idempotent upserts/removals keyed by
  entity id — replay overlap after a tRPC snapshot is harmless by
  construction.
- **session stream (16):** `threadCreated/Updated`,
  `turnStarted/Completed/Failed/Cancelled`,
  `messageStarted/Delta/Completed`, `toolCallStarted/Updated`,
  `permissionRequested/Resolved`, `planUpdated`, `settingsUpdated`,
  `error`. Envelope: `{id, sessionId, threadId, cursor, occurredAt,
  causationId, payload}`; dedup by `id`.

### Cursors and incarnations — 2 kinds

| Cursor | Format | Minted by |
|---|---|---|
| host stream | `h<boot-id>-<serial>` | SyncHub, per host boot |
| session events | `c<serial>` per session; same value in live stream, snapshot `head`, `getEvents` boundaries | CanonicalSessionsRuntime |

An *incarnation* is one lifetime of a log's owner (host boot; session
tracking lifetime). Host cursors embed it today, so a restarted host
deterministically rejects stale cursors. Session cursors get their
incarnation tag together with the durable store (they must persist to be
meaningful across restarts); until then a resurrected session recovers via
reset frames. Session-list paging cursors were **deleted** along with list
pagination.

### Recovery model — two paths, one guard

1. **Cold-load (automatic, per-stream, cheap).** Triggers: ring eviction
   (client slept), host restart, session resurrection, upstream adapter
   resync. `reset` names one stream; only it re-fetches. Handler = the
   first-connect code path, literally.
2. **Host restart (human hammer).** Already a desktop button. Registry and
   vendor transcripts survive; sessions come back `offline`; the first live
   mutation resurrects (spawn adapter → `session/load` → vendor replays its
   own disk → canonical log rebuilt). Reads never resurrect — listing 50
   dead sessions spawns 0 children.

Guard: **reset circuit breaker** — N resets on one stream within a window →
stream status `error`, stop auto-resubscribing, surface to UI. A reset loop
is by definition a host bug; clients must stop, not spin.

### Read-consumption reality (retention design note)

Humans re-read user messages, attachments, and each turn's final assistant
response. Old turns' tool calls and deltas are write-only in practice.
Consequences: client eviction drops old-turn tool events/deltas first,
keeping a meaningful "skeleton"; tool payloads are already separable
(nullable, capped); the durable store indexes by event class so a future
condensed/skeleton `getEvents` mode is an additive parameter. **Not in v1**
— plain backwards paging at 100 events/page is enough.

### What was cut from the previous draft (and why)

| Cut | Why |
|---|---|
| Claim/lease machinery (`claimToolCall`, claims, `claimed` state, `claimId`) | `askUser` pops on all devices by design; first resolve wins; receipts already make the loser's submit a clean stale error |
| `Session.attention[]` | client-derived; the low-level `pendingPermissions`/`openClientToolCalls` in the host snapshot are the primitives |
| WS snapshot packets (`hostSnapshot`, `sessionSnapshot`) | duplicated the tRPC `list`/`get` outputs; snapshots are big and belong on tRPC |
| `search` | no consumer |
| `createSideChat` + `sideChat` thread kind | no UI plans it; re-adding is additive |
| `getThread`, `listThreads` | snapshots + thread events already deliver threads |
| `list` pagination | session lists are small; deletes a whole cursor kind |
| `getEvents` anchors (`time`/`event`) + forward paging | only backwards-from-latest is real usage |
| separate `updateSettings` | one patch mutation |

### Test evidence and work needed

Already proven on THIS surface (all automated, `bun test`, green on
`feat/sessions-v1-simplified-api`):
- **Realistic-scenario suite** (`sessions-sync-client.integration.test.ts`,
  11 tests, real host + real WebSocket, fake adapter): cold connect via
  tRPC snapshots, streaming turns with causation receipts, permission
  cards, offline replay across a mid-stream disconnect, a fresh client
  converging from nothing, archiving, scrollback paging until the store
  equals the host's full journal, session switching under load, and a
  **host reboot** — old cursors rejected under the new boot, exactly one
  `reset(CURSOR_INVALID, refetchSnapshot)` per stream, cold path re-seeds,
  no duplicated or lost event ids, streaming resumes. The reboot test also
  pins the causationId-loss gap (Layer 3, step 5).
- Circuit breaker: >3 resets in 30 s parks the stream in `error`
  (`RESET_LOOP`) and stops auto-resubscribe; cleared on reconnect.
- Hub: foreign/evicted cursor → reset → cold path; two-hub restart
  collision; send-failure drop; dispose idempotence; randomized stress
  storm with a byte-parity oracle (required-`after` grammar).
- Client store: reset handling, snapshot re-seed, paging never resurrects
  resolved cards, mid-flight fetch races, never-subscribed packet drops,
  reconnect backoff, socket loss downgrades `live` → `idle` (data kept).
- Runtime: offline sessions — passive reads synthesize (`head` = zero
  cursor, empty tail), live paths resurrect (fake adapter); backwards
  paging with `hasMoreBefore`/`truncatedBefore`; merged `update` receipts.
- Gym user story **10/10 with a real Opus instance** over sessions.* +
  `/sessions/sync` on this exact surface (tRPC-seeded client, claimless
  question cards, merged `update` for the acceptEdits switch, final parity
  oracle that pages the whole journal backwards and deep-equals it against
  the client fold; zero drops, zero resets).

Work needed (details in the Rollout section below):
- Durable history store (#10): disk-backed `getEvents`, session-cursor
  incarnations, lossless resurrection, persisted `causationId`.
- React bindings package; mobile rewire (keep chat UI, kill
  `session-protocol` data plane); Maestro phone replay (execution 4).
- Real OS-process host kill/respawn journey test.

---

## Layer 3 — One realistic scenario, exact payloads

Phone opens the app, drives a turn with a permission card, loses the
network mid-stream, recovers, then the host is restarted and the session
resumes. (This is the shape of the automated scenario test; the gym E2E
runs the same surface with a real model.)

**1 — Cold connect.** Phone calls `sessions.list`:

```jsonc
// → response (host snapshot; also the capability probe)
{
  "sessions": [ {
    "id": "ses_01", "workspaceId": "ws_gym", "title": "Fix relay test",
    "mainThreadId": "thr_main", "agent": {"id": "claude-code", "displayName": "Claude Code"},
    "runState": "idle",
    "capabilities": { "threadModel": "nested", "threadFidelity": "partial",
                      "canResume": true, "supportsPermissions": true,
                      "supportsModes": true, "supportsModels": true },
    "settings": { "activeModel": "opus[1m]", "activeMode": "default", "effort": null,
                  "configuration": {} },
    "eventHead": "c000000000512",
    "createdAt": 1783532100000, "updatedAt": 1783532400000,
    "lastActivityAt": 1783532400000, "archivedAt": null, "closedAt": null,
    "error": null } ],
  "pendingPermissions": [],
  "openClientToolCalls": [],
  "head": "h1734-000000000381"
}
```

Phone opens the socket and subscribes to the host stream from `head`; user
taps the session, phone calls `sessions.get("ses_01")` (snapshot above) and
subscribes the session stream from its `head`:

```jsonc
{ "type": "hello", "protocolVersion": 1, "requestId": "req_h1",
  "clientInstanceId": "cli_phone", "clientVersion": "1.15.0",
  "toolResolvers": [ { "toolName": "ui.ask_user", "version": 1 } ] }
{ "type": "helloAck", "requestId": "req_h1", "hostId": "org_7", "connectionId": "conn_a" }
{ "type": "subscribe", "requestId": "req_s1", "subscriptionId": "sub_host",
  "stream": { "type": "host" }, "after": "h1734-000000000381" }
{ "type": "subscribed", "subscriptionId": "sub_host", "cursor": "h1734-000000000381" }
{ "type": "caughtUp",   "subscriptionId": "sub_host", "cursor": "h1734-000000000381" }
{ "type": "subscribe", "requestId": "req_s2", "subscriptionId": "sub_ses1",
  "stream": { "type": "session", "sessionId": "ses_01" }, "after": "c000000000512" }
{ "type": "subscribed", "subscriptionId": "sub_ses1", "cursor": "c000000000512" }
{ "type": "caughtUp",   "subscriptionId": "sub_ses1", "cursor": "c000000000512" }
```

**2 — A turn with a permission card.** User sends a message:

```jsonc
// tRPC sessions.submitTurn
{ "requestId": "req_t9", "sessionId": "ses_01", "threadId": "thr_main",
  "content": [ { "type": "text", "text": "run the failing test and fix it" } ] }
// receipt — admission only
{ "status": "accepted", "turnId": "trn_10" }
```

Events stream on `sub_ses1` (envelope shown once, then payloads only):

```jsonc
{ "type": "event", "subscriptionId": "sub_ses1", "stream": "session",
  "cursor": "c000000000513",
  "event": { "id": "evt_513", "sessionId": "ses_01", "threadId": "thr_main",
             "cursor": "c000000000513", "occurredAt": 1783532410000,
             "causationId": "req_t9",
             "payload": { "type": "turnStarted", "turn": { "id": "trn_10",
               "sessionId": "ses_01", "threadId": "thr_main", "status": "accepted",
               "originatingClientInstanceId": "cli_phone",
               "createdAt": 1783532410000, "updatedAt": 1783532410000 } } } }
// … subsequent payloads:
{ "type": "messageStarted",  "message": { "id": "msg_u1", "role": "user", "content": [ … ], … } }
{ "type": "messageStarted",  "message": { "id": "msg_a1", "role": "assistant", "content": [], … } }
{ "type": "messageDelta",    "messageId": "msg_a1", "content": { "type": "text", "text": "Running the test" } }
{ "type": "toolCallStarted", "toolCall": { "id": "tc_bash1", "tool": { "name": "bash", "version": 1 },
    "title": "bun test relay.test.ts", "input": { "command": "bun test relay.test.ts" },
    "resolver": { "type": "host" }, "state": "awaitingPermission",
    "parentToolCallId": null, "turnId": "trn_10", … } }
{ "type": "permissionRequested", "permission": { "id": "perm_1", "toolCallId": "tc_bash1",
    "multiSelect": false, "options": [
      { "id": "allow_once", "name": "Allow once",  "kind": "allowOnce" },
      { "id": "allow_always", "name": "Always allow", "kind": "allowAlways" },
      { "id": "reject_once", "name": "Reject", "kind": "rejectOnce" } ],
    "requestedAt": 1783532412000 } }
```

The card shows on the phone AND the desktop (no claims). Phone answers
first:

```jsonc
// tRPC sessions.resolvePermission (desktop's later attempt → NOT_FOUND, its card drains)
{ "requestId": "req_p1", "sessionId": "ses_01", "permissionId": "perm_1",
  "outcome": { "type": "selected", "optionIds": ["allow_once"] } }
```

```jsonc
{ "type": "permissionResolved", "permissionId": "perm_1",
  "outcome": { "type": "selected", "optionIds": ["allow_once"] } }
{ "type": "toolCallUpdated", "toolCallId": "tc_bash1",
  "update": { "state": "running", "updatedAt": 1783532413000 } }
{ "type": "toolCallUpdated", "toolCallId": "tc_bash1",
  "update": { "state": "succeeded", "output": { "exitCode": 0 }, "updatedAt": … } }
{ "type": "messageDelta", "messageId": "msg_a1", "content": { "type": "text", "text": " — passes now." } }
{ "type": "messageCompleted", "messageId": "msg_a1" }
{ "type": "turnCompleted", "turnId": "trn_10", "stopReason": "endTurn" }
```

**3 — Mid-stream disconnect.** Phone loses network after `c…525`; the agent
keeps streaming on the host. Phone reconnects (exponential backoff), replays
the gap, converges:

```jsonc
{ "type": "subscribe", "requestId": "req_s3", "subscriptionId": "sub_ses1b",
  "stream": { "type": "session", "sessionId": "ses_01" }, "after": "c000000000525" }
{ "type": "subscribed", "subscriptionId": "sub_ses1b", "cursor": "c000000000525" }
// events c…526 … c…541 replay here; dedup by event.id absorbs any overlap
{ "type": "caughtUp", "subscriptionId": "sub_ses1b", "cursor": "c000000000541" }
```

**4 — Long sleep → reset → cold path.** Phone returns after hours; the ring
(5k events) evicted its cursor:

```jsonc
{ "type": "subscribe", "requestId": "req_s4", "subscriptionId": "sub_ses1c",
  "stream": { "type": "session", "sessionId": "ses_01" }, "after": "c000000000525" }
{ "type": "reset", "subscriptionId": "sub_ses1c", "sessionId": "ses_01",
  "code": "CURSOR_INVALID", "recovery": "refetchSnapshot" }
// phone re-runs the cold path: tRPC get → subscribe(after: new head). One stream,
// one refetch; every other stream on the socket is untouched.
```

If the host answered every such subscribe with another `reset` (a host bug),
the circuit breaker trips after N attempts: the stream goes `error`, the UI
shows a retry affordance, nothing spins.

**5 — Host reboot.** User restarts the host (desktop button). The socket
closes; the phone's store keeps rendering its replica. On reconnect,
`sessions.list` still shows `ses_01` — the SQLite registry survived — with
`runState: "offline"`. The phone's old cursors belong to the dead boot:
host-stream cursor `h1734-…` fails parsing under boot `h1802` → `reset` →
cold path. User types a new message → `submitTurn` → the host spawns a fresh
adapter child, issues `session/load` with the stored native session id, the
vendor replays its own on-disk transcript, the canonical log is rebuilt
(new event ids, fresh cursors), and events flow again. A turn that was
mid-flight when the host died is terminalized (`turnFailed`), not silently
resumed — the user resubmits.

Known gap, pinned by the reboot test: the rebuilt canonical log loses
`causationId` attribution. Request→event linkage is armed in the translator
process; the vendor journal doesn't record it, so every rebuilt event
carries `causationId: null`. Receipts and UI still work (they key on
entities, not causation); only "which request produced this event"
archaeology degrades until the durable store (#10) persists the canonical
log itself.

---

## Open questions for review

1. Snapshot `recentEvents` tail size (trade first-paint completeness vs
   response size over the relay) — shipped default: 50.
2. Circuit-breaker N and window — shipped default: 3 resets / 30 s
   (`maxStreamResetsPerWindow` / `streamResetWindowMs`, overridable per
   client).
3. Session-cursor incarnation tag ships with the durable store (#10), or
   block v1 on it? Proposal: ship v1 with reset-frame recovery; #10 adds
   the tag.
4. Condensed/skeleton history mode: v1.1+ (taxonomy already supports it).

---

## Rollout

Where this stands (2026-07-12):

**Done** (on `feat/sessions-v1-simplified-api`, all suites green plus a
real-model E2E): the protocol package, the `sessions.*` router and
`/sessions/sync` hub, the shared projection reducer, the framework-free
client store with reset circuit breaker, the 11-test realistic-scenario
suite (disconnect, scrollback parity, session switching, host reboot), and
the gym story 10/10 with a real Opus instance.

**Direction:** ACP and the Mastra chat stack are both being retired from
this path. The host serves this surface; the ACP bridge behind it gets
replaced by a direct Claude SDK adapter with no client-visible change, then
removed. Mastra chat stays in the tree only so existing desktop users keep
working — frozen, no new features, and never used by mobile.

**Next, in order:**

1. Durable history store: disk-backed `getEvents`, session-cursor
   incarnations, persisted `causationId`, delete/retention.
2. React bindings (`host-service-react`) and the mobile rewire: keep the
   shipped chat-screen UI, replace the `session-protocol` data plane with
   this client, then delete `packages/session-protocol`.
3. Direct Claude SDK adapter behind the same surface (prototype on the
   `claude-sdk-session-harness` branch, PR #5582): run both adapters
   through the same real-model story, switch, then remove the ACP surface
   (`acpSessions.*`, per-session ACP sockets).
4. Maestro phone replay of the story (execution 4) as the final gate.

**Gates:** `bun run lint` and typecheck exit 0; the story passes on every
lane it applies to; teardown leaves no process, socket, DB handle, or temp
directory; the documented memory caps are measured with a transcript beyond
those caps.

## E2E user story (the validation spine)

One realistic session, in user terms. It must pass with a real Claude
instance on each surface it migrates across: (1) the shipping ACP surface —
`acp-user-story.integration.test.ts`; (2) `sessions.*` + `/sessions/sync` —
`sessions-user-story.integration.test.ts`; both pass 10/10 with real Opus
today; then (3) the direct SDK adapter, and finally (4) replayed from a real
phone via Maestro.

### The gym project

The story runs in a disposable "gym" repo the harness provisions per run
(`packages/host-service/test/helpers/gym.ts`):

- `notes.txt` — known data (`fixture_id`, `values=13,29`, `expected_sum=42`)
  that the subagent and workflow steps read, so results are assertable.
- `.claude/workflows/acp-e2e-dummy.js` — the saved five-agent workflow
  (inspect → analyze → audit ×2 → verify) over `notes.txt`.
- `.claude/skills/gym-check/SKILL.md` — a trivial skill that reads
  `notes.txt` and prints a sentinel.
- `scripts/ok.sh` and `README.md` — a runnable script and an editable file,
  so two *different* tools (Bash vs file edit) can each trigger a
  permission card.

Run the story with the model pinned to `opus`: the scripted prompts depend
on precise instruction-following.

### The first message

Sent verbatim as the session's initial prompt (the story tests quote this
block):

```text
You are a real Claude instance running inside an automated end-to-end test of
Superset's session harness. This workspace is a disposable "gym" repo created
for this run; nothing in it is real product code. The test exercises the
harness around you: streaming, interrupts, permissions, questions, subagents,
workflows, skills. Follow every instruction in this conversation literally and
minimally, use exactly the tools named, and reply with the exact sentinels
requested. Start now: write a continuous ~600-word tour of this repository in
plain prose, using no tools, and end with the line TOUR_DONE.
```

### The steps

1. Create the gym workspace — worktree provisioned, no agent process yet.
2. Start a session with the first message, model pinned to `opus`,
   permission mode `default` (never bypass).
3. The ~600-word tour streams incrementally — no gaps, no duplicates; other
   connected devices see the same stream live.
4. Stop mid-stream — the turn is cancelled, partial text stays, session
   returns to idle, nothing left pending.
5. `continue` resumes the same conversation and reaches `TOUR_DONE`.
6. A Bash run raises a permission card (allow once / always allow /
   reject); the session reads "needs attention", not "stuck".
7. Allow once — the card resolves on all devices at once, the script runs,
   `RUN_OK`; a second tap gets "already answered", never a double
   execution.
8. Always-allow on a rerun — the choice sticks for this session.
9. Two more runs auto-approve with zero new cards.
10. A README edit raises a fresh card — always-allow was scoped per tool.
11. Stop, switch the session to acceptEdits, `continue` — the edit applies
    with no card; every tool call still lands in the transcript.
12. AskUserQuestion with two questions — cards arrive one at a time, and
    the turn shows "waiting for you", not running.
13. Answer blue on the first, Skip the second — each answer registers
    exactly once; the agent replies `ANSWERS blue`.
14. A Task subagent reads `notes.txt` — its own partial-fidelity
    `subagent` thread (never flattened), result flows back as `SUB_OK 42`.
15. The saved workflow launches exactly once, runs its five agents in the
    background, and completes verified (`WORKFLOW_VERIFIED`).
16. The gym-check skill runs and reports its sentinel.
17. A second session streams in parallel over the same socket — no bleed
    between streams, cards, or attention.
18. Drop and reconnect — both streams catch up exactly; a too-old cursor
    resyncs transparently via the cold path.
19. Host restart — sessions show offline, not gone; opening one loads its
    transcript; a new message resumes the same native conversation.
20. Phone opens both sessions — identical transcripts, cards, and chips;
    the first answer wins everywhere. Final gate: Maestro replays steps
    2–19 from the phone against a real host.
