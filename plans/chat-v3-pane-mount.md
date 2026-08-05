# ChatV3Pane + host-service mount — implementation plan

**Status:** draft. Executes ship-plan §3 (the pane component tree lives there — not repeated here); this doc covers the wiring that §3 assumed: the host mount, the missing client entries in `packages/chat`, and data-layer facts.

## 0. Data layer: what actually changes (less than expected)

- **host.db: NOTHING.** No new tables, no new columns — ratified boundary ("host.db never grows a chat table"). `chat.db` is created and migrated by `@superset/chat-runtime` itself at `createChatRuntime({ dataDir })` time, living beside host.db in `~/.superset/<orgId>/`.
- Host-service's only DB touchpoint: **read** its existing `workspaces` table inside the `resolveCwd(workspaceId)` callback (worktree path lookup — the "resolved facts, never concepts" boundary).
- Cloud `chat_sessions` row (list sync via Electric): **deferred past the demo.** The pane's session list reads the runtime's `listSessions` directly; the cloud write (tRPC path only, per decision) comes with cross-device polish, not with the flag build.
- Mount-time trap (recorded in ship plan): pass `migrationsFolder` explicitly — `src/db/drizzle/` is a runtime file dependency the desktop bundle won't inline; the packaged app must ship the folder (extraResources or copied beside the host-service bundle) and hand its path in.

## A. Host-service mount (~1–2 days)

```
packages/host-service/src/chat-v3/          # thin mount only; "runtime/chat/" name is taken by legacy mastra code
  mount.ts        # buildChatRuntime(): createChatRuntime({ dataDir, migrationsFolder, harnesses })
                  #   harnesses: Map { "claude-code" -> createClaudeAdapter, "codex" -> createCodexAdapter }
  resolveCwd.ts   # workspaceId -> worktree path via existing workspaces read model; throws typed
                  #   not-found (router maps it to NOT_FOUND)
```

- `app.ts` registrations, both gated behind the same internal-build flag pattern as ACP (`isInternalBuild()` env → gate):
  - tRPC: mount `createChatRouter(runtime, { resolveCwd })` at `POST/GET /chat-v3/trpc/*` via `@trpc/server` fetch adapter on the existing Hono app (second tRPC endpoint — the established per-domain pattern; host auth middleware applied at the route).
  - Stream: `GET /chat-v3/sessions/:id/stream?since=&deltas=` — upgrade exactly like `/acp-sessions/:id/stream` does today, wrap the socket in `createWsSink`, call `runtime.subscribe(...)`, dispose subscription on close.
- Lifecycle: build the runtime lazily on first chat request; `runtime.dispose()` in host-service shutdown hooks.
- Relay compatibility: both routes ride the existing tunnel as-is (buffered HTTP for tRPC, WS upgrade for the stream) — nothing new relay-side.

## B. `packages/chat` client + react entries (~2–3 days — the unbuilt M2 half)

These were deferred at M1 and are now the gating work; exports map grows `./client` and `./react`.

```
src/client/
  subscribeToSession/   # reconnecting WS consumer: injected WebSocket impl + URL builder,
                        #   since-cursor resume, declared delta channels, reset -> signal refetch,
                        #   exponential backoff, epoch-change handling per protocol §5-6
  sessionClient/        # one object per session: tRPC caller (injected, typed by ChatRouter import
                        #   type-only from chat-runtime) + subscription + getItems pagination
src/react/
  useChatSession/       # seed (getSession+getItems) -> reduceMany -> live tail via subscribeToSession;
                        #   outbox wiring (clientId echo clears optimistic); coalesced to 1 commit/frame
                        #   (rAF scheduler injected); loadOlder; auto-resync on reset
  useTimeline/          # memoized deriveTimeline over snapshot
  useApprovals/
```

Tests headless against a real runtime + fake harness over an in-memory socket pair (no HTTP): the reconnect-mid-turn parity and spine-only convergence assertions rerun at the hook level.

## C. The pane (~4–5 days) — component tree per ship-plan §3, unchanged

Wiring specifics only:
- tRPC client: `createTRPCProxyClient<ChatRouter>` (type-only import) against the workspace host URL from `WorkspaceProvider` (same URL resolution as workspaceTrpc; relay-aware); WS URL likewise.
- Registered as pane kind `"chat"` → `ChatV3Pane` behind the `chat_v3` flag (registry swap per ship plan; deletion PR comes at flag-flip, not now).
- Demo gate (CDP-verified per AGENTS rules): create session (harness picker: claude-code | codex) → type → streamed markdown → tool call renders → approval card accept/decline → diff content renders → cancel mid-turn shows honest interrupted state → reopen pane, transcript replays identically.

## Sequencing

A and B in parallel (different packages), C after B's hooks exist; total ~1.5–2 weeks to the flagged demo. The IOU ledger (backpressure, crash sweep, better-sqlite3 execution — which milestone C exercises for the first time in a real Electron process, memory/dispose, dispatch-error threshold) burns down during dogfood, gated by the flag-flip PR.

## D. Data-model decision (2026-08-05, ratified): scope_id, not workspace_id, in chat.db

`chat_sessions_local.workspace_id` renames to **`scope_id`**: an opaque, caller-defined grouping label the runtime stores and filters by but never interprets (k8s-labels pattern). The protocol keeps `workspaceId` (product vocabulary); the router maps `workspaceId → scopeId` at the binding. Rule, recorded in the runtime README: **chat.db columns may only contain values the caller passed in — nothing resolved by the runtime, nothing owned by another database.** Rejected alternative (host.db mapping table referencing chat.db ids): breaks single-transaction atomicity of create+group (ghost-session class), and forces every host flavor to carry its own mapping schema. If rich per-workspace metadata (pinning, ordering) arrives later, host.db may add such a table additively — the label handles membership, host tables handle meaning.
