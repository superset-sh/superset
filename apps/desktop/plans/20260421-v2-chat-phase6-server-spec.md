# Phase 6 — Host-Service Streaming Implementation Spec

**Date:** 2026-04-21
**Status:** spec, pending implementation
**Companion:** `20260421-v2-chat-refactor-phased-plan.md` §6
**Client-side status:** ✅ shipped in commits `b133d7963` → `fff3c7ea6` → (next commit). `stream.ts` + `useChatStream` + recovery coordinator all landed and tested. ChatSurface calls `useChatStream` with `undefined` transport today — the hook is inert until this spec is implemented.

---

## 1. Goal

Replace the 250 ms tRPC polling loop (`getDisplayState` + `listMessages`) with a push-based subscription from host-service to the renderer. Messages, tool calls, reasoning deltas, status flips, and dock events arrive as `ChatStreamEvent`s with monotonic sequence numbers.

End state after shipping:
- Renderer `useChatStream` is active (subscribe + fetchSnapshot passed).
- Polling demoted to "fallback on disconnect" — triggered by recovery coordinator when the stream drops.
- `useDualWriteFromLegacy` + `useDualWriteDocksFromLegacy` become dead code (delete in Phase 8).

---

## 2. Inputs already in place

| Piece | Location |
|---|---|
| Wire types | `packages/chat/src/shared/events.ts` — `ChatStreamEvent` union, already supports every event kind we need |
| Recovery coordinator | `packages/chat/src/client/recovery.ts` — t3code port, 17 tests |
| Client subscriber | `packages/chat/src/client/stream.ts` — 9 tests |
| Client hook | `apps/desktop/.../ChatPane/.../ChatSurface/hooks/useChatStream/useChatStream.ts` — React wrapper |
| Host-service chat runtime | `packages/host-service/src/runtime/chat/chat.ts` — `ChatRuntimeManager` already subscribes to mastracode harness events (line 326 `subscribeToSessionEvents`) |
| Existing chat router | `packages/host-service/src/trpc/router/chat/chat.ts` — queries + mutations, no subscriptions yet |

---

## 3. Transport decision: two options

### Option A — tRPC WebSocket subscription (preferred)

Host-service currently mounts tRPC over HTTP only (`/trpc/*` in `app.ts:109`). Add `@trpc/server/adapters/ws` on the same WebSocket server hono already has, then expose `chat.streamSession` as a subscription.

**Pros:**
- Single protocol for all chat RPC.
- Type-safe end-to-end via the router.
- The client glue (`useChatStream`) can wrap `workspaceTrpc.chat.streamSession.subscribe()` directly.

**Cons:**
- Requires adding the WS adapter and handling auth on the WS upgrade (mirror what `wsAuth` does for `/events`).
- tRPC subscriptions in v11 use async generators (async iterables). trpc-electron's observable restriction does NOT apply here — this is an HTTP/WS server, not Electron IPC.

### Option B — piggyback on the existing event bus

Host-service already runs a `registerEventBusRoute` WS at `/events` (app.ts:102). Emit `ChatStreamEvent`s onto that bus keyed by sessionID, and have the client subscribe to a filtered view.

**Pros:**
- No new transport.

**Cons:**
- Messier types (the bus is untyped).
- Authorization at per-session granularity is ad-hoc.
- The client-side `useChatStream` would need a custom subscribe function that wraps the event bus — more glue.

**Recommendation:** Option A. Adding the tRPC WS adapter is ~30 LOC and buys cleaner typing + reuse.

---

## 4. Server surface to add

### 4.1 `chat.streamSession` — subscription

```ts
// in packages/host-service/src/trpc/router/chat/chat.ts
streamSession: protectedProcedure
    .input(sessionInput)
    .subscription(async function* ({ ctx, input, signal }) {
        const emitter = ctx.runtime.chat.subscribeSession(input);
        try {
            for await (const event of emitter) {
                if (signal?.aborted) break;
                yield event as ChatStreamEvent;
            }
        } finally {
            emitter.return?.();
        }
    }),
```

`ctx.runtime.chat.subscribeSession` returns an async iterable of `ChatStreamEvent`.

### 4.2 `chat.getSnapshot` — query

```ts
getSnapshot: protectedProcedure
    .input(sessionInput)
    .query(({ ctx, input }) => ctx.runtime.chat.getSnapshot(input)),
```

Returns `{ sequence: number; event: SessionSnapshotEvent }` matching `SessionSnapshotResult` from the client. The snapshot event's `sequence` must match the server's `latestSequence` at the moment the snapshot was assembled, so the client's recovery coordinator can anchor correctly.

### 4.3 `ChatRuntimeManager` additions

```ts
// packages/host-service/src/runtime/chat/chat.ts

interface SessionStream {
    /** Monotonically increasing counter for this session. */
    sequence: number;
    /** Per-session event emitter. AsyncIterable adapter on top. */
    emitter: EventEmitter;
}

private sessionStreams = new Map<string, SessionStream>();

subscribeSession(input: { sessionId: string; workspaceId: string }): AsyncIterable<ChatStreamEvent> {
    const stream = this.getOrCreateStream(input.sessionId);
    return this.makeAsyncIterable(stream.emitter);
}

async getSnapshot(input): Promise<SessionSnapshotResult> {
    const messages = await this.listMessages(input);
    const displayState = await this.getDisplayState(input);
    const stream = this.getOrCreateStream(input.sessionId);
    return {
        sequence: stream.sequence,
        event: {
            type: "session.snapshot",
            sequence: stream.sequence,
            sessionID: input.sessionId,
            at: Date.now(),
            snapshot: {
                messages: adaptLegacyMessagesToV2(messages),
                parts: extractParts(messages),
                status: displayState.isRunning ? { type: "busy" } : { type: "idle" },
                historyMore: false,
            },
        },
    };
}
```

### 4.4 Harness → `ChatStreamEvent` translation

Inside `subscribeToSessionEvents` (already exists at `chat.ts:326`), after the existing lastErrorMessage / sandbox-question bookkeeping, emit translated events:

```ts
runtime.harness.subscribe((event: unknown) => {
    // ...existing bookkeeping...

    const stream = this.getOrCreateStream(runtime.sessionId);
    const seq = ++stream.sequence;

    // Translate harness event → ChatStreamEvent
    const translated = translateHarnessEvent(event, {
        sessionID: runtime.sessionId,
        sequence: seq,
        at: Date.now(),
    });
    if (translated) stream.emitter.emit("event", translated);
});
```

**`translateHarnessEvent` cases** (to be built incrementally):

| Harness event | Emits |
|---|---|
| `agent_start` | `session.status` → `{type: "busy"}` |
| `agent_end` | `session.status` → `{type: "idle"}` |
| `message_appended` (user or assistant) | `message.append` with the new Message |
| `text_delta` | `part.delta` with `kind: "text"`, appending the delta |
| `tool_call_started` | `part.append` with a ToolPart in `running` state |
| `tool_call_input_delta` | `part.delta` with `kind: "tool.input"` |
| `tool_call_completed` | `part.delta` with `kind: "tool.state"` `{ kind: "completed", output }` |
| `tool_call_errored` | `part.delta` with `kind: "tool.state"` `{ kind: "error", error }` |
| `reasoning_delta` | `part.delta` with `kind: "reasoning"` |
| sandbox question request | `dock.question.set` |
| plan proposal | `dock.plan.set` |
| approval request | `dock.approval.set` |
| todos update | `dock.todos` |

Each translation is small and isolated. Build them incrementally — the client will show whatever's translated, and fall back to not-showing for the rest. Start with `agent_start/end`, `message_appended`, `text_delta` — those cover 80% of the visible chat.

### 4.5 WebSocket adapter setup

```ts
// in app.ts where we mount /trpc/*
import { applyWSSHandler } from "@trpc/server/adapters/ws";

const wss = /* get the node-ws server from createNodeWebSocket */;
const trpcHandler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext: async (opts) => {
        const isAuthenticated = await providers.hostAuth.validate(opts.req);
        return { /* same as HTTP */ };
    },
});

// Mount on a dedicated path, e.g. /trpc-ws
```

And the client (in `apps/desktop`) wires `wsLink` for the subscription route while keeping `httpLink` for queries/mutations. `@trpc/client` supports a `splitLink` that routes subscriptions to WS and everything else to HTTP.

---

## 5. Client-side work to enable

When 4.1–4.5 are in place:

### 5.1 Flip the subscribe / fetchSnapshot args in ChatSurface

```ts
// apps/desktop/.../ChatSurface.tsx
const subscribe: StreamSubscribe = useCallback(
    (input, opts) => {
        const sub = workspaceTrpc.chat.streamSession.subscribe(input, {
            onData: opts.onData,
            onError: opts.onError,
            onComplete: opts.onClose,
        });
        return { unsubscribe: () => sub.unsubscribe() };
    },
    [],
);

const utils = workspaceTrpc.useUtils();
const fetchSnapshot: StreamFetchSnapshot = useCallback(
    (input) => utils.client.chat.getSnapshot.query(input),
    [utils],
);

useChatStream({
    sessionId: props.sessionId,
    subscribe,
    fetchSnapshot,
});
```

### 5.2 Demote the polling loop

Either:
- Turn `refetchInterval: 250` into `refetchInterval: false` in `useWorkspaceChatDisplay` when streaming is active, or
- Delete `useDualWriteFromLegacy` + `useDualWriteDocksFromLegacy` entirely (preferred — they become dead code).

Recovery coordinator handles reconnect-fallback: on stream disconnect, it re-bootstraps via `fetchSnapshot`. Polling is no longer needed.

### 5.3 Delete the bridge guards

Once the stream is authoritative, these become dead code:

- `applySessionSnapshot`'s preserve-optimistic + shadow-by-text-match path → simplify to a plain `messages: snapshot.messages`.
- `dedupeOptimisticUserMessages` in `fromLegacyMessages`.
- The `parentID` sanity check in `useWorkspaceChatDisplay`'s `dualWriteMessages` useMemo.
- `useDualWriteFromLegacy` + `useDualWriteDocksFromLegacy` files.

Each of these was compensating for a race the streaming model eliminates. Delete in one commit once the stream is stable.

---

## 6. Effort estimate

- **4.5 WebSocket adapter setup** — 1–2 hours. `@trpc/server/adapters/ws` + auth wiring + `splitLink` on client.
- **4.1 / 4.2 / 4.3 router + runtime methods** — 2–3 hours. Mostly plumbing; event emitter shape is standard.
- **4.4 harness event translation** — 3–5 hours to cover the 80% case; another day to cover the long tail (subagent progress, compaction, dock transitions). Incremental.
- **5.1 / 5.2 / 5.3 client flip** — 1–2 hours. Small, mostly deletes.

Total: **1–2 days** for a working MVP, another day to cover remaining harness events.

---

## 7. Dogfood acceptance

Ship the MVP behind a second flag (`CHAT_V2_STREAMING`) so the fallback polling path stays available during rollout. The acceptance test is the one we've been hitting repeatedly:

1. Open a session with 10+ tool calls.
2. Send a message.
3. The optimistic user message appears instantly.
4. The assistant streams tokens continuously (no 250 ms chunk flicker).
5. Mid-stream, kill the network briefly (`networksetup -setairportpower en0 off`, `on` a second later). The UI recovers via the snapshot path without losing state.
6. No double-response, no message moving between turns, no flicker.

When that passes, delete the bridge (5.3) and the second flag.

---

## 8. Open questions to resolve before picking this up

1. **Per-session or per-connection sequence?** Per-session is simpler (each session has its own counter) — one sessionID, one sequence stream. Use that.
2. **How does getSnapshot pause mastracode while building the snapshot?** Shouldn't need to — read listMessages + getDisplayState atomically, use the current sequence at that moment. Tiny races close themselves via replay.
3. **What's the rate-limit on harness event emission?** If mastracode streams at 100+ deltas/sec, do we want to batch emits on the server (e.g. 30 Hz) to reduce WS chatter? Defer the call — profile first.
4. **Mastracode runtime events — what's the actual shape?** Need to inventory in `packages/host-service/src/runtime/chat/chat.ts` and the mastracode package to build `translateHarnessEvent` accurately.
