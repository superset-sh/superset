# @superset/chat-runtime

`HarnessAdapter` → `LiveSession` → journal (`chat.db`) → `SubscriptionHub` → sinks; commands drive it.

A harness adapter emits protocol events, `LiveSession` turns them into durable events, the journal assigns each one a cursor and persists it in the package's own SQLite file (writing the read-model projection in the same transaction), and the hub fans the resulting envelopes out to subscribers — replaying from the journal first so a reconnecting client sees no gap. Everything a client can do (create a session, prompt, cancel, answer an approval, page history) enters through `commands/`.

The runtime speaks only the vocabulary in `plans/chat-protocol-v1.md`; it never resolves workspaces, spawns processes, or touches host.db. Callers pass a resolved `cwd`.

**chat.db columns may only contain values the caller passed in — nothing resolved by the runtime, nothing owned by another database.** That is why sessions are grouped by `scope_id`: an opaque, caller-defined label the runtime stores and filters by but never interprets. The protocol keeps `workspaceId` as product vocabulary and the tRPC router maps `workspaceId → scopeId` at the binding, so a host that groups sessions by something else needs no schema change here.

## Reading order

| Folder | What lives there |
|---|---|
| `db/` | `schema/` (the `chat_journal` + `chat_sessions_local` tables), `createChatDb/` (better-sqlite3, WAL, migrations applied at open) and `drizzle/` (the generated migrations this package owns) |
| `journal/` | `journal/` appends a durable event and the projection row in one transaction; `epoch/` mints an epoch on create or journal loss (journal is its only consumer, so it nests here) |
| `replay/` | Reads the spine: `readSince`, `readPage`, `latestSeq`. Top-level because journal, stream, commands and the test helpers all consume it |
| `projection/` | Every `chat_sessions_local` read and write, plus `ChatSessionStore`. Top-level because journal, replay, commands and the root wiring all consume it |
| `harness/` | `HarnessAdapter` + `AdapterEvent` — the contract every harness implements — plus `eventQueue/` (the async-iterable pump adapters emit through), `fake/` (the scripted adapter that drives the runtime tests) and `codex/`. Adapters emit protocol shapes only: no cursors, no persistence, no sockets |
| `sessions/` | `liveSession/` (one running session: event pump, FIFO prompt queue, cancel) and `registry/`, which builds one per harness |
| `stream/` | `subscriptions/` — `SubscriptionHub`: replay-then-live subscribe, per-subscriber delta channels, reset frames, delta coalescing |
| `commands/` | The client-facing verbs, each parsed with the `@superset/chat` command schemas and deduped by `commandId` |
| `router/` | `router/` — `createChatRouter(runtime, { resolveCwd })`, the tRPC surface over `commands/` (the package owns its own `initTRPC`; procedures close over the runtime, and the host resolves `cwd` — clients never send it) — and `wsSink/`, the structural WebSocket→`Sink` adapter host-service's stream route mounts |
| `testing/` | The cross-cutting test helpers no single module owns — `fixtures/` (protocol item factories), `testUtils/` (sinks, schedules, waits) and `testRuntime/` (the bun-sqlite runtime). Test-only: exported as `@superset/chat-runtime/testing` so sibling chat packages' headless tests can drive a real runtime, never imported by shipping code. Helpers that do have an owner stay beside it, like `harness/fake/` |

## Wiring a harness

```ts
const runtime = createChatRuntime({
  dataDir,
  harnesses: new Map([
    ["claude-code", (opts) => createClaudeAdapter(opts)],
    ["codex", (opts) => createCodexAdapter(opts)],
  ]),
});
```

The registry is empty by default; tests register the fake via `fakeHarnessRegistry()` from `src/testing/testUtils`.

## The codex harness

`harness/codex/` speaks the codex **app-server** JSON-RPC protocol over stdio — not `@openai/codex-sdk`, which drops tool arguments and diff text. `rpcClient/` owns framing (newline-delimited JSON), request correlation and server-initiated requests; `codexAdapter/` owns thread and turn lifecycle, approvals and the version gate; `mapThreadItem/` turns a codex `ThreadItem` into one of our items.

Codex's `initialize` response advertises no capabilities, so the only handshake signal is the version inside `userAgent`. The adapter gates on `MIN_CODEX_VERSION` and ends the session with a `notice` plus `status: "dead"` rather than streaming a transcript it cannot map; everything else is handled by tolerating unknown notifications (they become `notice` items) instead of comparing versions.

`SessionState.modeId` maps to codex's sandbox/approval pairing — `read-only`, `auto`, `full-access` — applied to each `turn/start`, because the app-server has no per-thread collaboration-mode setter.

Fixtures in `harness/codex/fixtures/*.jsonl` are real recorded frames, replayed through `fixturePlayer/` as a transport so the adapter tests exercise the actual wire. Re-record them with a codex binary on PATH:

```bash
bun run scripts/recordCodexFixtures.ts            # all scenarios
bun run scripts/recordCodexFixtures.ts approval   # one scenario
```

The recorder copies only `auth.json` into a throwaway `CODEX_HOME`, so recordings carry no local hooks, MCP servers or home paths.

Host-service registers the `/chat-v3/*` routes unconditionally: they carry the same auth as every other host route, and the runtime is built on first request, so a host nobody chats with never creates `chat.db`. Rollout is a client concern — the desktop renderer gates the pane on the `chat-v3` PostHog flag, so flips take effect live rather than waiting for a host restart.

When host-service mounts this package it must pass `migrationsFolder`: the generated `src/db/drizzle/` directory is a runtime file dependency that the bundler will not inline.
