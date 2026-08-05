# Chat Protocol v1 — item vocabulary and wire contract

**Status:** draft for review. Companion to `plans/chat-ui-greenfield-research.md` (§4–5). This is the exact spec the zod schemas in the new chat package's `src/protocol/` transcribe. Donors: ACP `schema/v2` for content shapes, Codex app-server v2 for protocol mechanics, `claude-code-acp` for the Claude Code mapping, Cline for cursor fencing. We do not claim ACP compliance; ACP v1 is spoken only inside harness adapters.

Conventions: all shapes below are the wire format (JSON, camelCase). All timestamps are epoch milliseconds. `?` marks optional fields. Every union is **open** — receivers MUST tolerate unknown variants and unknown fields (render a generic row, never throw).

---

## 1. Core model

```
Session  — durable unit; one agent session in one workspace
  Turn   — one user input → agent response round trip
    Item — every visible thing in the transcript; flat list, stable ids
```

Items are **flat** (no nesting in the data model). Hierarchy (subagents) is expressed by `parentItemId` and is a rendering concern.

### 1.1 Cursor

```ts
type Cursor = { epoch: string; seq: number };
```

- `epoch` is minted by the host when a session journal is created or rebuilt (host restart, journal loss). Opaque string; only equality is meaningful.
- `seq` is a per-session monotonic counter **within an epoch**, assigned to every durable event.
- A cursor from a different epoch is never comparable — a client presenting a stale-epoch cursor gets `reset`, not a partial replay. (This closes the known cross-restart overlap bug in the current ACP stream.)

### 1.2 Envelope

Every server→client frame:

```ts
type Envelope =
  | { v: 1; sessionId: string; cursor: Cursor; ts: number; event: DurableEvent }
  | { v: 1; sessionId: string; ts: number; delta: Delta }      // no cursor: not part of the spine
  | { v: 1; sessionId: string; ts: number; reset: Reset };
```

Durable events get cursors; deltas do not (they are not replayable and carry `itemId` for targeting). `v` is the envelope version — vocabulary growth is additive within `v: 1`; only envelope-shape breaks bump it.

---

## 2. Durable events (the spine)

```ts
type DurableEvent =
  | { type: "item";    item: Item;   turnId: string }        // FULL snapshot, upsert by item.id
  | { type: "turn";    turn: Turn }                          // full snapshot, upsert by turn.id
  | { type: "session"; session: SessionState };              // full snapshot
```

**There is no create/update distinction and no patch format.** Every `item` event carries the complete item. The client reducer is `items.set(item.id, item)` — this is the decision that makes reconnection, replay, and multi-client trivial, and it is not negotiable within v1.

### 2.1 Turn

```ts
type Turn = {
  id: string;
  status: "running" | "completed" | "failed" | "interrupted";
  error?: { message: string };            // present iff failed
  usage?: Usage;                          // a LEVEL, not a delta — latest wins
  startedAtMs: number;
  completedAtMs?: number;
};

type Usage = {
  inputTokens: number;
  cachedInputTokens: number;              // distinct so cost display is honest
  outputTokens: number;
  contextUsed?: number;                   // tokens in context window
  contextSize?: number;
  costUsd?: number;
};
```

### 2.2 SessionState

```ts
type SessionState = {
  status: "starting" | "running" | "awaiting_input" | "idle"
        | "not_loaded" | "offline" | "dead";
  harness: string;                        // e.g. "claude-code", "codex"
  title?: string;
  modeId?: string;                        // harness mode (plan/default/...)
  modelId?: string;
  availableModes?: { id: string; label: string }[];   // adapter-advertised;
  availableModels?: { id: string; label: string }[];  // pickers render from these,
                                                      // never from hardcoded lists
};
```

`awaiting_input` is the list-level "Needs Input" badge — it is set whenever any approval or question is pending, so a thread list renders it without opening the session. `not_loaded` (cold, resumable) is distinct from `offline` (host unreachable) and `dead` (unresumable).

---

## 3. Items

Common fields on every item:

```ts
type ItemBase = {
  id: string;                             // stable across all snapshots of this item
  parentItemId?: string;                  // subagent / nested provenance
  startedAtMs: number;
  completedAtMs?: number;
};
```

The v1 vocabulary — seven kinds:

```ts
type Item = UserMessage | AgentMessage | Reasoning | ToolCall
          | Plan | ApprovalRequest | Notice;
```

### 3.1 `user_message`

```ts
type UserMessage = ItemBase & {
  kind: "user_message";
  clientId?: string;                      // client-minted id for optimistic reconciliation
  content: UserContent[];
};

type UserContent =
  | { type: "text"; text: string; elements?: TextElement[] }
  | { type: "attachment"; attachmentId: string; name: string; mimeType: string };

type TextElement = {                      // mention/command chips as byte ranges (Codex)
  byteRange: { start: number; end: number };
  elementKind: "file_mention" | "slash_command" | "other";
};
```

Optimistic sends reconcile on `clientId` echo — never on text equality (the current heuristic bug class).

### 3.2 `agent_message`

```ts
type AgentMessage = ItemBase & {
  kind: "agent_message";
  text: string;                           // markdown; AUTHORITATIVE over concatenated deltas
};
```

### 3.3 `reasoning`

```ts
type Reasoning = ItemBase & {
  kind: "reasoning";
  text: string;
  summary?: string;
};
```

### 3.4 `tool_call` — the load-bearing item

```ts
type ToolCall = ItemBase & {
  kind: "tool_call";
  title: string;                          // human-readable, ADAPTER-SUPPLIED, required.
                                          // "Editing src/foo.ts", never "edit_file".
  toolKind: "read" | "edit" | "delete" | "move" | "search"
          | "execute" | "think" | "fetch" | "other";   // renderers dispatch on THIS,
  toolName: string;                       // ...never on toolName (detail display only)
  status: "running" | "completed" | "failed" | "declined" | "canceled";
  content: ToolContent[];
  locations?: { path: string; line?: number }[];       // follow-along hook
  rawInput?: unknown;                     // detail view only; may be truncated by adapter
  rawOutput?: unknown;
};

type ToolContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText: string | null; newText: string }
        // oldText null = file creation; one renderer for create + modify
  | { type: "terminal"; command: string; output: string; exitCode?: number;
      truncated?: boolean };
        // output is an authoritative snapshot; live bytes arrive as deltas
```

`declined` and `canceled` are **statuses, not errors** — a refused tool renders as a normal settled row.

### 3.5 `plan`

```ts
type Plan = ItemBase & {
  kind: "plan";
  entries: { text: string; status: "pending" | "in_progress" | "completed" }[];
};
```

Each snapshot **replaces the plan wholesale** (ACP rule). Clients diff against the previous array to animate; they never merge.

### 3.6 `approval_request`

```ts
type ApprovalRequest = ItemBase & {
  kind: "approval_request";
  targetItemId: string | null;            // null = not attributable to one item
  title: string;
  detail?: ToolContent[];                 // e.g. the diff being approved
  options?: { optionId: string; label: string }[];  // harness-supplied choices (ACP)
  status: "pending" | "answered" | "stale";
  decision?: Decision;                    // present iff answered
};

type Decision =
  | { type: "accept" }
  | { type: "accept_for_session" }
  | { type: "decline" }                   // agent continues the turn
  | { type: "cancel" }                    // turn is interrupted
  | { type: "option"; optionId: string }; // harness-native option passthrough
```

Approvals are items so they render inline on/next to the row they gate, survive in history as answered rows (no dead buttons — the answered card has no controls), and can be marked `stale` when the host loses provider state instead of hanging forever.

### 3.7 `notice`

```ts
type Notice = ItemBase & {
  kind: "notice";
  noticeKind: "compaction" | "config_change" | "error" | "info";
  text?: string;
};
```

The generic-row fallback: adapters emit `notice` for harness events with no better mapping, and clients render unknown *item kinds* with the same visual treatment.

---

## 4. Deltas (live-only layer)

```ts
type Delta =
  | { type: "text";      itemId: string; append: string }   // agent_message / reasoning text
  | { type: "tool_input"; itemId: string; append: string }  // streaming raw JSON input
  | { type: "terminal";  itemId: string; append: string };  // raw output bytes (utf8-lossy)
```

Rules:

- Deltas are **never persisted and never replayed**. A client that ignores them entirely still converges via item snapshots.
- The final item snapshot is **authoritative** — clients must overwrite delta-accumulated state with it on `item` receipt (concatenated deltas may not equal the final text).
- Clients declare delta subscriptions at connect (`deltas: ["text"]`); the host does not send undeclared channels. A phone on cellular takes `text` only; desktop takes all three.
- Host coalesces deltas (target ≤30 frames/sec per session); clients additionally coalesce to ≤1 render commit per animation frame.

---

## 5. Reset

```ts
type Reset = {
  reason: "invalid_cursor" | "epoch_changed" | "journal_missing" | "session_not_found";
};
```

On `reset` the client discards local transcript state for the session and refetches: `getSession` + paged `getItems` (which stream through **the same reducer** as live events), then resubscribes from the returned cursor.

---

## 6. Subscription & replay contract

- Subscribe: `WS /sessions/:sessionId/stream?since=<epoch>:<seq>&deltas=text,terminal`.
- If `since` is valid for the current epoch: host replays durable events `> seq` **in order**, then goes live. Replay and live are indistinguishable to the client.
- If not: single `reset` frame, connection stays open, client refetches as above.
- Absent `since`: host sends a bootstrap replay of the most recent N turns' spine (paging older history via `getItems(before)`).
- **The transcript never shrinks** during any replay/reconcile: reducers apply snapshots item-by-item; there is no "replace all" operation on the client (Cline's rule).

## 7. Commands (client → host)

Carried over existing tRPC. Every mutating command takes a client-minted `commandId` (uuid); the host dedupes on it, making retries safe over flaky links.

```
createSession { commandId, workspaceId, harness, modeId?, modelId? }
prompt        { commandId, sessionId, content: UserContent[], clientId }
steer         { commandId, sessionId, expectedTurnId, content }   // fails if turn mismatch (CAS)
cancelTurn    { commandId, sessionId, turnId }                    // stop is IN-BAND, never a socket close
respondToApproval { commandId, sessionId, approvalId, decision: Decision }
setMode / setModel / setConfigOption { commandId, sessionId, ... }
forkSession   { commandId, sessionId, fromItemId?, harness? }
   → { sessionId }                       // new session, forkedFromSessionId set
```

**Fork is the one command behind three features:** edit-a-past-message (fork at that item, send the edited prompt into the fork), regenerate (fork at the turn boundary, re-send), and cross-harness continuation (fork with a different `harness`; the journal projects into the new session's opening context — see chat-harness-adapters.md §4b). The original session is never truncated (invariant 4).

**Prompt-while-running:** a `prompt` arriving during a running turn is **queued host-side (FIFO)** and delivered at the turn boundary; the queued `user_message` item is emitted immediately with a `queued: true` field (cleared on delivery) so every client renders it in place. `steer` is the only mid-turn injection path, and its `expectedTurnId` CAS is what makes it safe. Clients must not infer "idle" from the absence of a running turn while queued prompts exist — `SessionState.status` stays `running` until the queue drains (the "wait for working before trusting idle" footgun, made unrepresentable).

## 8. Persistence (host)

Append-only journal per session in host SQLite: `(epoch, seq, ts, event_json)` rows for durable events only. The read model (`getItems`, `getSession`, list metadata incl. `awaiting_input`) is a projection of the journal — written in the same transaction as the journal append, so the read model cannot durably disagree with the log (T3 invariant). Deltas never touch storage.

## 9. Invariants (the rules that outrank convenience)

1. Item events carry **full snapshots**; the only client mutation is upsert-by-id.
2. **One pure reducer** serves live streaming, reconnect replay, and history pagination.
3. Deltas are optional, droppable, per-client, and always superseded by the next snapshot.
4. The transcript never shrinks; edit-a-past-message forks a session (`forkedFromSessionId`), never truncates.
5. `declined`/`canceled`/`stale` are statuses, not errors.
5b. In-flight turns do not survive host death (true of every surveyed implementation). On resurrection the host journals the truth: the running turn → `interrupted`, its running tool_calls → `canceled`, pending approvals → `stale`. The UI renders an honest seam, never a spinner that outlived its process.
6. Cursors are epoch-qualified; cross-epoch cursors reset, never partially replay.
7. `stop`/`cancel` are in-band commands; a dropped socket means *nothing* about user intent.
8. All unions are open; unknown kinds render generically, unknown fields are preserved on round-trip.
9. Everything crossing a process/network/persistence boundary is **parsed** (zod), not asserted.
10. Adapters supply `title` and `toolKind` — renderers never parse tool names, shell commands, or raw payloads to produce summaries.

## 10. Adapter obligations (per harness)

An adapter (host-side, e.g. Claude Code via ACP v1 / `claude-code-acp` shapes) must:

- Mint stable item ids and map harness updates into full item snapshots (tracking in-flight state as needed — the v1 create/update race lives *here*, invisibly to clients).
- Synthesize `title`/`toolKind` when the harness omits them.
- Emit `approval_request` items from permission callbacks, mark them `stale` on provider loss, and translate `Decision` back into the harness's response format (harness-native options via `Decision.option`).
- Downsample firehoses (terminal output) into snapshot + bounded deltas; set `truncated`.
- Emit `notice` for anything unmappable rather than dropping it silently.

## 11. Explicitly out of scope for v1

- Cross-device cloud sync of the journal (host is the source of truth; cloud replication is a later layer behind the same read API).
- Mid-turn device handoff.
- Subagent transcripts as first-class sessions (v1: `parentItemId` provenance only; "link, don't inline" navigation can come later).
- Rich text composer document format (the composer produces `UserContent`; its internal editing model is a client concern).
- A `question` item kind (multi-question ask-user forms) — v1 models these as `approval_request` with `options`; split out only if that proves lossy.

## 12. Open questions for review

1. Should `terminal` content promote to a session-level object with its own id (ACP v2 direction) instead of inline content? v1 says inline; revisit when terminals-in-chat get interactive.
2. `accept_with_policy_amendment` (Codex's "remember forever") — deferred; needs a policy store design first. The `Decision` union is open, so it's additive.
3. Does `usage` belong on `Turn` only, or also streamed per-item for long tool calls? v1: turn-level only.
4. Journal compaction/retention policy on the host (size caps, zstd cold storage à la Codex rollouts).
