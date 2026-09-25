# Replace the mastra chat harness with a Claude Agent SDK session runtime

> **Status: archived alternative, not current implementation documentation.** The selected ACP harness is implemented; see [`packages/host-service/docs/acp-sessions.md`](../packages/host-service/docs/acp-sessions.md) for current behavior, [`plans/done/20260710-session-harness-acp.md`](./done/20260710-session-harness-acp.md) for the shipped outcome, and [`plans/acp-session-follow-ups.md`](./acp-session-follow-ups.md) for remaining work. This file is retained only as the direct-Claude-SDK fallback design.
>
> If this path is ever revived, note that four scope decisions were made *after* this draft and would apply here too: (1) ship **parallel to mastra**, not as a replacement — mastra is in production on desktop; the excision (Milestone 6) and desktop migration (Milestone 4) move to a later hard-swap plan; (2) **keep session processes alive forever** — no idle disposal (Q3 resolved); (3) list **live sessions only** — dead sessions just disappear, no resume-after-restart requirement (which also removes the need for the `agent_sessions` SQLite registry); (4) auth = the host machine's logged-in Claude account (Q1 resolved to option a).

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` and the ExecPlan template in `.agents/`.

## Purpose / Big Picture

Today every AI chat session in Superset is executed by `mastracode` (the "mastra harness"), wrapped twice — once in the desktop Electron main process and once in the host-service — and every client learns about session progress by polling snapshots at 250ms. Message history lives inside mastra's private memory store, the host cannot report which model a session is running, and mobile talks to the host through a hand-written, lossy type facade that nothing enforces.

After this change:

- The **host-service is the single owner** of AI session OS processes. It runs sessions with the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), which spawns one Claude Code subprocess per active session and persists transcripts as JSONL on the host's disk.
- A new **`packages/session-protocol`** package is the shared contract: Claude SDK types re-exported type-only, plus our own session-scoped state, event envelope, and paginated API types with zod schemas. Desktop and mobile both import it; mastra/claude types never need hand-copied facades again.
- Clients (desktop v2 workspace UI, mobile, any future client) attach to a session at any time via the host's tRPC API for state/history/actions, and a **resumable, sequence-numbered event stream** (SSE for direct connections, WebSocket through the relay) for real-time updates. Any attached client can drive the session: send messages, answer permission requests, switch model, interrupt.
- **mastracode and all `@mastra/*` dependencies are deleted.** Zero backwards compatibility: old mastra threads are not migrated. The design leaves an explicit seam for a future Codex harness (a `harness` discriminator on sessions and events).

Demonstrable outcome: run the desktop app, open a v2 workspace, start a chat that is executed by Claude Code via the host-service; open the same session on mobile through the relay and watch the same tokens stream in live on both screens; answer a permission prompt from either device; kill the host-service mid-session, restart it, and continue the conversation with full history intact.

## Assumptions

- The Claude Agent SDK version pinned is `@anthropic-ai/claude-agent-sdk@0.3.205` or newer. Its API surface used here (verified against the published `sdk.d.ts` of 0.3.205): `query()` streaming-input mode, `canUseTool`, `Options.resume`, `Options.permissionMode`, `Options.env`, `Options.cwd`, `Options.includePartialMessages`, `Query.setModel/setPermissionMode/interrupt/initializationResult`, `listSessions`, `getSessionMessages` (paginated), `getSessionInfo`, `forkSession`, and the types-only export `@anthropic-ai/claude-agent-sdk/sdk-tools`.
- Sessions authenticate to Anthropic on the host machine. See Open Question Q1 for which credential is injected; the spike (Milestone 0) resolves it before any production code depends on it.
- The cloud metadata flow is unchanged: `chat_sessions` rows in cloud Postgres (created via `packages/trpc` `chat.createSession`, synced to clients by Electric) remain the cross-device session *directory*. This plan only replaces the *runtime* and message-content layer on the host.
- Desktop already spawns the host-service as a child process for local use (`apps/desktop/src/main/host-service/index.ts`), so "desktop attaches to host-service" requires no new process infrastructure.

## Open Questions

- **Q1 — Anthropic credentials for host-spawned sessions.** Options: (a) rely on the host machine's existing Claude Code login (`~/.claude` OAuth), (b) inject `ANTHROPIC_API_KEY` via `Options.env` from Superset-provisioned credentials (analogous to today's `runtimeResolver.prepareRuntimeEnv()`). Impacts Milestone 0 and 2. → Decision Log D9 placeholder. *(Resolved later, outside this draft: option a.)*
- **Q2 — Web app (`apps/web`) migration.** It talks to the host with hand-rolled fetch calls today. Out of scope here unless trivially cheap after Milestone 3; confirm. → Decision Log D10 placeholder. *(Resolved later: out of scope.)*
- **Q3 — Idle process policy.** One Claude subprocess per active session; propose dispose after 30 minutes idle and resume on demand via `Options.resume` (cheap because transcripts persist as JSONL). Needs product sign-off on the resume latency tradeoff (~1–3s to respawn). → Decision Log D11 placeholder. *(Resolved later: no disposal — keep alive forever.)*
- **Q4 — Retention/GC of JSONL transcripts** on the host disk. Not blocking; decide before GA. → Decision Log D12 placeholder. *(Resolved later: out of scope.)*

## Progress

- [x] (2026-07-09 18:00Z) Discovery: mapped mastra harness call sites, host-service transport, relay streaming constraints, SDK 0.3.205 surface.
- [x] (2026-07-09 18:30Z) Clarified scope, transport, type-lift, and migration strategy with Kirill (see Decision Log D1–D8).
- [ ] Milestone 0: SDK spike inside host-service context.
- [ ] Milestone 1: `packages/session-protocol`.
- [ ] Milestone 2: host-service `SessionManager` + `sessions` tRPC router.
- [ ] Milestone 3: resumable event stream (SSE direct + WS via relay) + client subscribe helper.
- [ ] Milestone 4: desktop v2 workspace chat on the new stack.
- [ ] Milestone 5: mobile on the new stack.
- [ ] Milestone 6: mastra excision (delete both old runtimes, drop deps, repoint v1 desktop panes).

## Surprises & Discoveries

- Observation: the relay cannot stream HTTP responses — `sendHttpRequest` in `apps/relay/src/tunnel.ts` buffers one complete `TunnelHttpResponse` per request, so SSE cannot traverse the relay. The relay *does* proxy arbitrary WebSocket channels (`openWsChannel`/`sendWsFrame`, used by `/terminal/*` today).
  Evidence: `apps/relay/src/tunnel.ts:343-404`.
- Observation: `packages/chat-protocol` and `packages/durable-session` are referenced in `AGENTS.md` but do not exist as directories; the earlier "SCP v1" normalized-envelope design was never built. This plan supersedes it (Decision D2).
- Observation: the Claude SDK surfaces AskUserQuestion, plan approval (ExitPlanMode), and ordinary tool approvals all through the single `canUseTool` callback, and ships typed tool input/output schemas at `@anthropic-ai/claude-agent-sdk/sdk-tools` (types-only export). Today's three parallel pending flows (approval / question / plan) collapse into one `PendingPermissionRequest` model.
- Observation: `SessionMessage` objects returned by `getSessionMessages` carry a runtime `timestamp` field that is absent from the declared type; and `getSessionMessages` omits system messages unless `includeSystemMessages: true` (needed to render compaction boundaries).

## Decision Log

- Decision D1: The new runtime lives **only in host-service**; desktop is just another attached client (via its locally spawned host-service).
  Rationale: single process owner, single codepath, matches the multi-client requirement.
  Date/Author: 2026-07-09 / Kirill.
- Decision D2: The wire protocol carries **Claude SDK events verbatim** inside a thin envelope, and `packages/session-protocol` **re-exports SDK types** (type-only) rather than normalizing them.
  Rationale: zero drift, zero translation bugs; the mobile facade's manual-sync failure mode is exactly what we're eliminating. Supersedes the unbuilt SCP v1 normalization design.
  Date/Author: 2026-07-09 / Kirill.
- Decision D3: **No migration, no backwards compatibility.** mastracode, `@mastra/core`, `@mastra/memory`, `@mastra/mcp` are removed from the repo. Old threads in `~/.mastracode` are abandoned.
  Date/Author: 2026-07-09 / Kirill.
- Decision D4: Future-proofing for Codex is limited to a `harness` discriminator (`'claude'` now, `'codex'` later) on session state and on `sdk`-kind stream events. No abstraction layers are built for a harness that doesn't exist yet.
  Rationale: YAGNI; the envelope makes room without cost.
  Date/Author: 2026-07-09 / Kirill + Claude.
- Decision D5: Real-time transport is **SSE for direct connections and WebSocket through the relay**, both carrying identical sequence-numbered envelope frames. Delivery is at-least-once with client-side dedup by `seq`; gaps heal via snapshot re-sync (see "Stream protocol" below). No relay protocol changes.
  Rationale: neither SSE nor WS guarantees delivery by itself; the seq/cursor design makes the transport interchangeable and reconnects lossless within the journal window. The relay already proxies WS channels; extending it to stream HTTP is avoidable work.
  Date/Author: 2026-07-09 / Kirill (directional) + Claude (mechanism).
- Decision D6: **Transcript truth is the Claude SDK's native JSONL persistence** on the host (`~/.claude/projects/...`), read through `getSessionMessages` (paginated). Host SQLite gains only a small `agent_sessions` registry table (superset-session-id ↔ claude-session-id ↔ workspace ↔ last state snapshot). The SDK's alpha `SessionStore` interface is not used.
  Rationale: pagination, resume, and fork come for free and stay correct across SDK upgrades; the alpha store API is a stability risk with no payoff for v1.
  Date/Author: 2026-07-09 / Claude, open to challenge.
- Decision D7: `packages/session-protocol` depends on `@anthropic-ai/claude-agent-sdk` as a regular dependency but only ever `import type`s it (plus the pure-types `/sdk-tools` subpath). Its shipped runtime code is zod schemas and the small stream-client helper — all React-Native-safe. Enforcement: a lint-greppable rule, `import { ... } from '@anthropic-ai/claude-agent-sdk'` (non-type) is forbidden in this package.
  Rationale: type-only imports are erased at compile time, so Metro never bundles the SDK; bun workspace hoisting means the SDK is installed once at the repo root anyway (host-service needs it for real).
  Date/Author: 2026-07-09 / Kirill.
- Decision D8: Pending interactions (tool approvals, AskUserQuestion, plan approval) are one unified `PendingPermissionRequest` list in session state, resolved by one `sessions.respondToPermission` procedure. Clients render by `toolName`.
  Rationale: mirrors how the SDK actually delivers them (`canUseTool`); removes three parallel respond paths.
  Date/Author: 2026-07-09 / Claude.
- Decision D9 (placeholder): Anthropic credential source — resolved by Milestone 0.
- Decision D10 (placeholder): web app scope.
- Decision D11 (placeholder): idle disposal policy.
- Decision D12 (placeholder): transcript retention.

## Outcomes & Retrospective

(To be written at completion.)

## Context and Orientation

Definitions used throughout:

- **Harness**: the library that actually runs an AI coding agent turn loop. Today it is the object returned by `createMastraCode(...).harness` (from the `mastracode` npm package). After this plan it is the Claude Agent SDK's `query()`.
- **Spike** (not an acronym): a time-boxed exploratory prototype used to answer uncertain technical questions before production implementation. Milestone 0 would run the real SDK against a throwaway workspace to verify authentication, streaming input, permissions, structured questions, interruption, and resume behavior; the script is evidence tooling, not production runtime.
- **Host-service** (`packages/host-service`): a Hono HTTP server that runs on a user's machine. Desktop spawns it as a child process on `127.0.0.1` (`apps/desktop/src/main/host-service/index.ts`); it also dials out a persistent WebSocket tunnel to the **relay** so remote clients can reach it.
- **Relay** (`apps/relay`, deployed on Fly.io): forwards `https://relay/hosts/:hostId/trpc/*` requests and `wss://relay/hosts/:hostId/*` WebSocket upgrades over the host's tunnel. HTTP forwarding is buffered (no streaming); WebSocket forwarding is frame-by-frame (streaming works).
- **tRPC**: typed RPC. The host-service mounts its router at `/trpc/*` via `@hono/trpc-server` with `superjson` (`packages/host-service/src/app.ts`, router at `src/trpc/router/router.ts`).
- **SSE (Server-Sent Events)**: a one-way HTTP response that stays open and emits `id:`/`data:` frames; browsers reconnect automatically and send the last received `id` back as the `Last-Event-ID` header.
- **Electric / `chat_sessions`**: cloud Postgres table (in `packages/db`) synced read-only to clients; it is the cross-device *list* of chat sessions (title, workspace, timestamps). Message *content* never lives there.

What exists today and is being replaced:

- `packages/chat/src/server/trpc/service.ts` — `ChatRuntimeService`, the desktop-local mastra runtime + tRPC router, mounted over Electron IPC at `apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.ts`, consumed by v1 chat panes through `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts` (250ms polling).
- `packages/host-service/src/runtime/chat/chat.ts` — `ChatRuntimeManager`, the host-service mastra runtime, exposed by `packages/host-service/src/trpc/router/chat/chat.ts` (`getSnapshot`, `sendMessage`, `respondToApproval/Question/Plan`, …), consumed by desktop v2 (`apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/**/useWorkspaceChatDisplay`) and by mobile over the relay (`apps/mobile/lib/trpc/host-chat-types.ts`, a hand-written lossy facade; polling at 250ms).
- mastra deps appear in exactly three `package.json`s: `packages/chat`, `packages/host-service`, `apps/desktop`.
- Message persistence: mastra memory store under `~/.mastracode` (opaque). Host SQLite (`packages/host-service/src/db/schema.ts`, better-sqlite3 + drizzle, path `env.HOST_DB_PATH`) holds workspaces/terminals but no chat content.

Claude Agent SDK knowledge needed to implement this plan (verified against `sdk.d.ts` 0.3.205 — no external docs required):

- `query({ prompt, options })` returns a `Query` — an `AsyncGenerator<SDKMessage>`. Passing an **`AsyncIterable<SDKUserMessage>` as `prompt`** ("streaming input mode") keeps the underlying Claude Code subprocess alive across turns and unlocks control methods on the handle: `interrupt()`, `setModel(model?)`, `setPermissionMode(mode)`, `initializationResult()` (models list, slash commands, account info).
- Key `Options`: `cwd` (the workspace worktree), `resume` (Claude session UUID to reload history and continue), `forkSession`, `permissionMode` (`'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'` etc.), `model`, `effort` (`'low'|'medium'|'high'|'xhigh'|'max'`), `env` (subprocess environment — credential injection point), `includePartialMessages` (emit `SDKPartialAssistantMessage` streaming deltas), `canUseTool`, `abortController`, `maxTurns`.
- `canUseTool(toolName, input, { requestId, toolUseID, title, displayName, description, suggestions, blockedPath, decisionReason, agentID, signal })` is called whenever the agent needs a human decision. It resolves with `PermissionResult`: `{ behavior: 'allow', updatedInput?, updatedPermissions? }` or `{ behavior: 'deny', message, interrupt? }`. **AskUserQuestion arrives here too** — the answer is returned as `updatedInput` (the questions with chosen options); **plan approval arrives as ExitPlanMode** through the same callback. `updatedPermissions` (echoing `suggestions`) implements "always allow".
- The event stream (`for await (const msg of query)`) yields the 39-variant `SDKMessage` union: `assistant`/`user` message envelopes wrapping Anthropic API content blocks, `system` subtypes (`init` — carries the claude `session_id`, model, tools; `status`; **`session_state_changed`** with `state: 'idle' | 'running' | 'requires_action'`), `result` (turn end, cost/usage), `stream_event` partial deltas, compaction boundaries, etc. All JSON-serializable.
- History: `getSessionMessages(claudeSessionId, { limit, offset, includeSystemMessages })` reads the JSONL transcript (chronological, parentUuid-chain resolved). `listSessions({ dir, limit, offset })` enumerates transcripts; `getSessionInfo(id)` reads one. Transcripts live under the host's `~/.claude/projects/<encoded-cwd>/`.
- Types-only tool schemas: `@anthropic-ai/claude-agent-sdk/sdk-tools` exports `AskUserQuestionInput/Output`, `ExitPlanModeInput`, `FileEditInput`, `BashInput`, … — used by clients to render tool cards and question forms with real types.

### Relationship to the selected ACP implementation

The current comparison lives in
[`apps/mobile/plans/acp-vs-claude-sdk.html`](../apps/mobile/plans/acp-vs-claude-sdk.html).
The direct design preserves the same user-facing topology; it changes the
host-local ownership boundary:

| Dimension | Selected ACP implementation | This direct-SDK fallback |
|---|---|---|
| Agent owner | Adapter child owns the SDK Query; host speaks ACP over stdio. | Host owns the SDK Query and input queue directly. |
| Client delivery | ACP updates are wrapped in Superset seq envelopes. | SDK messages must be normalized into equivalent Superset envelopes. |
| Human interaction | Tool/plan approvals work today; structured questions require ACP form elicitation to be wired. | Tool approvals, plan approval, and `AskUserQuestion` all park in `canUseTool` callbacks directly. |
| Settings/control | Adapter-reported config and mode operations. | Direct Query methods and host-authored state projection. |
| Reconnect | Host journal + cursor replay/reset. | Same host journal + cursor replay/reset; no SDK resume is involved in a client reconnect. |
| Process death/restart | Dead sessions disappear; host restart loses them. | Same final v1 behavior despite the SDK's optional persisted resume capabilities. |
| Cost/risk | Extra process/translation layer and adapter/integration capability lag; less Superset-owned protocol code. | Fewer runtime layers and fastest SDK feature access; more custom lifecycle, normalization, and vendor coupling. |

The direct path becomes preferable only if adapter or integration lag—especially leaving structured elicitation unwired—costs more than owning this additional runtime and protocol surface. Until then it remains a fallback, not parallel implementation work.

## Plan of Work

### The protocol package (`packages/session-protocol`)

Create `packages/session-protocol` (`@superset/session-protocol`), following the repo's package conventions (see `packages/shared` for tsconfig/package.json shape). Dependencies: `@anthropic-ai/claude-agent-sdk` (types only — Decision D7), `zod`. Source layout:

```
packages/session-protocol/
  package.json            # exports ".", "./client"
  tsconfig.json
  src/
    index.ts              # barrel
    sdk-types.ts          # export type { SDKMessage, SDKUserMessage, SDKAssistantMessage,
                          #   SDKResultMessage, SDKSystemMessage, SDKPartialAssistantMessage,
                          #   SDKCompactBoundaryMessage, SDKSessionStateChangedMessage,
                          #   SessionMessage, SDKSessionInfo, PermissionResult, PermissionUpdate,
                          #   PermissionMode, ModelInfo, SlashCommand, EffortLevel, ... }
                          #   from "@anthropic-ai/claude-agent-sdk";
                          # export type { AskUserQuestionInput, ExitPlanModeInput, ... }
                          #   from "@anthropic-ai/claude-agent-sdk/sdk-tools";
    state.ts              # SessionScopedState, PendingPermissionRequest, SessionStatus
    events.ts             # SessionEventEnvelope, SessionEventPayload
    api.ts                # zod schemas + inferred types for every router procedure, pagination
    client/
      stream-client.ts    # transport-agnostic subscribe helper (see Milestone 3)
```

Core own types (final shapes to be refined during Milestone 1, but this is the contract):

```ts
export type HarnessKind = "claude"; // future: | "codex"

export type SessionStatus =
  | "starting"   // process spawning / init not yet received
  | "idle"       // alive, waiting for input
  | "running"    // agent turn in progress
  | "requires_action" // blocked on pendingPermissions
  | "exited"     // process disposed (resumable)
  | "errored";

export interface PendingPermissionRequest {
  requestId: string;        // canUseTool options.requestId — the resolution key
  toolUseID: string;
  toolName: string;         // "AskUserQuestion" | "ExitPlanMode" | "Bash" | ...
  input: Record<string, unknown>;   // narrow client-side via sdk-tools types
  title?: string;           // pre-rendered prompt sentence from the SDK
  displayName?: string;
  description?: string;
  suggestions?: PermissionUpdate[]; // for "always allow"
  blockedPath?: string;
  decisionReason?: string;
  agentID?: string;
  requestedAt: number;
}

export interface SessionScopedState {
  sessionId: string;            // Superset session id (= cloud chat_sessions.id)
  claudeSessionId: string | null; // from system:init; null until first init
  workspaceId: string;
  harness: HarnessKind;
  status: SessionStatus;
  model: string | null;         // authoritative current model
  permissionMode: PermissionMode;
  effort: EffortLevel | null;
  pendingPermissions: PendingPermissionRequest[];
  cwd: string;
  lastSeq: number;              // highest journal seq emitted for this session
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}
```

Stream protocol (`events.ts`):

```ts
export interface SessionEventEnvelope {
  seq: number;        // per-session, monotonic, starts at 1, never reused
  sessionId: string;
  ts: number;         // host epoch ms
  event: SessionEventPayload;
}

export type SessionEventPayload =
  | { kind: "sdk"; harness: "claude"; message: SDKMessage }          // verbatim
  | { kind: "permission_request"; request: PendingPermissionRequest }
  | { kind: "permission_resolved"; requestId: string; behavior: "allow" | "deny" }
  | { kind: "state"; state: SessionScopedState }                     // full snapshot on any change
  | { kind: "stream_reset"; reason: string };                        // cursor unservable → resync
```

Delivery semantics (this answers "what if we miss stuff"): the host journals every envelope per session in a bounded in-memory ring buffer (default: last 2,000 envelopes per session). A subscriber passes `since=<seq>`; the host replays `(since, latest]` from the journal, then goes live. Because `seq` is monotonic and gapless, a client detects loss by observing a jump; because SSE reconnects send `Last-Event-ID` automatically (and our WS client sends `since` explicitly on reconnect), brief disconnects heal losslessly within the buffer window. If `since` has fallen out of the buffer, the host sends `stream_reset` and the client performs a full re-sync: `sessions.get` (state) + `sessions.getMessages` (history tail) + resubscribe from the fresh `state.lastSeq`. Net guarantee: **at-least-once delivery with deterministic gap detection and an always-available repair path** — neither raw SSE nor raw WS gives you this; the cursor design does, on both.

Pagination convention (`api.ts`): every list procedure takes `{ limit: number (1..200, default 50), cursor?: string }` and returns `{ items: T[], nextCursor: string | null }`. For `getMessages`, the cursor encodes a message offset from the end so "first page = latest N, walk backwards" (the UI's natural order); internally it maps onto `getSessionMessages`'s `offset/limit`.

### The host runtime (`packages/host-service/src/runtime/sessions/`)

New `SessionManager` class replacing `ChatRuntimeManager`:

- Holds `Map<sessionId, ManagedSession>`. A `ManagedSession` owns: a push-driven `AsyncIterable<SDKUserMessage>` input queue; the `Query` handle; an `AbortController`; the ring-buffer journal + `seq` counter; the `SessionScopedState`; a `Map<requestId, deferred>` for in-flight permissions; and a set of attached stream subscribers (callback fan-out).
- `create({ sessionId, workspaceId, model?, permissionMode? })`: resolves `cwd` from host SQLite `workspaces.worktreePath` (same lookup `ChatRuntimeManager` uses today), builds `query()` with streaming input, `canUseTool` wired to the pending-permission machinery, `includePartialMessages: true`, `env` per Decision D9, and starts the event pump: `for await (msg of query)` → journal + broadcast as `{kind:'sdk'}`; on `system:init` capture `claudeSessionId`/`model`; on `session_state_changed` update `status`; on `result` update `status`/cost.
- `attach`-time reads never touch the process: `getState()` returns the in-memory state; `getMessages()` calls the SDK's `getSessionMessages(claudeSessionId, …)` against the JSONL transcript (works even when the process is disposed).
- `sendMessage` pushes into the input queue (creating/resuming the process first if `status === 'exited'`, via `Options.resume: claudeSessionId`). Model/effort changes ride either the dedicated procedures (`setModel` → `query.setModel`) or per-message metadata for parity with today's UX; both end with a `state` broadcast so **every attached client sees the authoritative current model** (fixes the gap called out in PR #5536).
- `respondToPermission({ requestId, response })` resolves the deferred exactly once; late duplicates from other clients get a typed `ALREADY_RESOLVED` error; resolution broadcasts `permission_resolved` + `state`.
- Registry: new host SQLite table `agent_sessions { id (pk, superset session id), workspace_id, claude_session_id, harness, status_snapshot (json), created_at, last_active_at }`, written through the existing drizzle setup in `packages/host-service/src/db/schema.ts` + a migration in the host-service migrations folder (this is host-local SQLite — the Neon/cloud migration rules in `AGENTS.md` do not apply, but never hand-edit generated migration files). The registry is what makes `sessions.list` and resume-after-host-restart work.

### The API (`packages/host-service/src/trpc/router/sessions/`)

New `sessions` router (replaces the `chat` router), every input/output validated by `@superset/session-protocol` zod schemas:

```
sessions.list({ workspaceId?, cursor?, limit })      → { items: SessionScopedState[], nextCursor }
sessions.get({ sessionId })                          → SessionScopedState
sessions.getMessages({ sessionId, cursor?, limit })  → { items: SessionMessage[], nextCursor }
sessions.create({ sessionId, workspaceId, model?, permissionMode? }) → SessionScopedState
sessions.sendMessage({ sessionId, payload: { content, files? }, metadata?: { model?, effort? } })
sessions.respondToPermission({ sessionId, requestId, response })   // allow/deny/updatedInput/updatedPermissions
sessions.interrupt({ sessionId })
sessions.setModel({ sessionId, model })
sessions.setPermissionMode({ sessionId, mode })
sessions.end({ sessionId })                          // dispose process; state → exited
sessions.getCatalog({ sessionId })                   → { models, commands }   // from initializationResult()
```

### The stream endpoints (`packages/host-service/src/app.ts`)

- `GET /sessions/:sessionId/stream?since=<seq>` — SSE. Each frame: `id: <seq>`, `data: <JSON envelope>`. Honors `Last-Event-ID` as an alias for `since`. For desktop (direct `127.0.0.1`) and web-direct.
- WS route `/sessions/:sessionId/stream` (registered alongside `/events` and `/terminal/*`, `wsAuth`-guarded) — same JSON frames; client sends `{ since }` as its first message. This is the relay path: the relay already proxies WS channels verbatim, so mobile gets live push with **zero relay changes**.

### The clients

- `@superset/session-protocol/client` ships `subscribeToSession({ transport: 'sse' | 'ws', url, since, onEnvelope, onReset, signal })` — a small dependency-free helper implementing reconnect + cursor + gap-detection + reset-resync callbacks. RN-safe (WS is native in RN; SSE path uses `fetch` streaming and is used only where available).
- Desktop v2: replace `useWorkspaceChatDisplay` polling with a new hook (co-located per repo structure rules) that does `sessions.get` + first page of `sessions.getMessages` + `subscribeToSession`, folding envelopes into local state. A shared view-model adapter (`toUiMessages(items, liveEnvelopes)`) maps Anthropic content blocks (`text`, `thinking`, `tool_use`, `tool_result`) onto the existing chat UI part renderers; pending permissions render from `state.pendingPermissions` by `toolName` (`AskUserQuestion` → question card with typed `AskUserQuestionInput`; `ExitPlanMode` → plan approval card; everything else → tool approval card with `title`/`description` from the request).
- Mobile: delete `apps/mobile/lib/trpc/host-chat-types.ts`; import `@superset/session-protocol`; replace `useChatThread`'s 250ms `getSnapshot` polling with the WS subscribe + snapshot flow. The model chip binds to `state.model` — cross-client switches finally reflect.

### The excision

Delete: `packages/host-service/src/runtime/chat/` + `src/trpc/router/chat/`; `packages/chat/src/server/trpc/` (service, zod, runtime utils) + `src/client/hooks/use-chat-display/`; `apps/desktop/src/lib/trpc/routers/chat-runtime-service/`; `apps/desktop/src/main/lib/agent-setup/agent-wrappers-mastra.ts`. Remove `mastracode`, `@mastra/core`, `@mastra/memory`, `@mastra/mcp` from all three package.jsons. Repoint the v1 desktop chat panes (`apps/desktop/src/renderer/components/Chat/**`, `ChatPane`) at the local host-service using the same new hook as v2 — desktop main already knows the host-service port via the coordinator. Audit what survives in `packages/chat`: slash-command tokenizers (`/shared`) and title generation stay if mastra-free; provider-credential machinery in `ChatService` shrinks to whatever Decision D9 requires. Grep gate: `grep -ri "mastra" --include="*.ts" -l` returns only historical plans/docs.

## Milestones

### Milestone 0 — Spike: SDK under host-service conditions (timebox: half a day)

Additive and isolated (a script under `packages/host-service/scripts/`, not production code). Prove on a real workspace worktree: spawn `query()` streaming-input with `cwd` set; observe `system:init` (session id, model); send two messages across one process; trigger `canUseTool` (a Bash command) and resolve it programmatically; trigger AskUserQuestion and answer via `updatedInput`; kill the script and `resume` the session with history intact via `getSessionMessages`. Resolve Q1 (credential source) by testing both auth paths. Outcome recorded in Surprises & Discoveries + Decision D9.

### Milestone 1 — `packages/session-protocol`

The package as specified above, plus unit tests for zod schemas and cursor encoding (`bun test packages/session-protocol`). Register in workspaces, `bun run typecheck` green. Acceptance: `apps/mobile` can add it as a dependency and `bun run --cwd apps/mobile typecheck` stays green (proves the RN type-only story).

### Milestone 2 — SessionManager + `sessions` router

Host-service runs Claude sessions end-to-end, queryable without any streaming: `sessions.create` → `sendMessage` → poll `get`/`getMessages` shows the turn; `respondToPermission` unblocks a Bash approval; `list` paginates; host-service restart + `sendMessage` resumes the session. Includes the `agent_sessions` migration. Acceptance: an integration test against a temp workspace + manual curl transcript (see Concrete Steps). The old `chat` router still exists and is untouched — both routers coexist until Milestone 6.

### Milestone 3 — Event stream + subscribe helper

SSE + WS endpoints, journal, `since` replay, `stream_reset` resync, and `subscribeToSession` in the protocol package. Acceptance: two concurrent subscribers (one SSE-direct, one WS-through-relay in the local relay dev setup from the mobile plan docs) both render the same ordered seq stream; killing one subscriber's connection for 10s and reconnecting with its last seq yields no gaps; reconnecting with `since=1` after journal eviction yields `stream_reset`.

### Milestone 4 — Desktop v2 on the new stack

Replace the v2 workspace chat data layer + permission cards. Acceptance: full manual flow in `bun dev` desktop — create session, streamed tokens visible token-by-token (not 250ms chunks), answer an AskUserQuestion and a Bash approval, switch model and see the chip update, interrupt a turn.

### Milestone 5 — Mobile on the new stack

Replace facade + polling. Acceptance: the live E2E from `apps/mobile/plans/mobile-chat-runtime.md` §Verification, but with push instead of polling, plus: switch model on desktop, see the mobile chip update without sending a message.

### Milestone 6 — Excision

The deletion list above. Acceptance: mastra grep gate; `bun run lint` exits 0 (CI treats warnings as errors); `bun run typecheck` green across all 28 packages; desktop v1 chat panes still function against local host-service; `bun test` green.

## Concrete Steps

Milestone-2 smoke transcript (run from repo root; host-service dev on port 4879):

```bash
bun run --cwd packages/host-service dev
# in another shell — create and drive a session:
curl -s localhost:4879/trpc/sessions.create -H 'content-type: application/json' \
  -d '{"json":{"sessionId":"<uuid>","workspaceId":"<workspace-uuid>"}}'
# Expected: {"result":{"data":{"json":{"sessionId":"...","status":"idle","model":"claude-...", ...}}}}
curl -s localhost:4879/trpc/sessions.sendMessage ... -d '...content:"list the files in this repo"...'
curl -s "localhost:4879/trpc/sessions.getMessages?input=..."
# Expected: items[] containing the user message and assistant tool_use/text blocks
```

Milestone-3 stream check:

```bash
curl -N "localhost:4879/sessions/<sessionId>/stream?since=0"
# Expected: frames "id: 1\ndata: {...\"kind\":\"state\"...}", then live sdk events during a turn
```

Validation at every milestone:

```bash
bun run typecheck   # all packages, no errors
bun run lint        # exit 0, zero warnings (CI fails on warnings)
bun test            # all tests pass
```

## Validation and Acceptance

The end-to-end acceptance for the whole plan is the Purpose scenario: desktop + mobile attached to one session, both driving it, live streams on both, host-service restart mid-conversation recovers with history. Each milestone above carries its own narrower acceptance; do not proceed past a milestone whose acceptance has not been demonstrated.

## Idempotence and Recovery

All milestones are additive until Milestone 6; the old mastra path keeps working alongside the new router the whole time, so rollback before M6 is "stop routing to `sessions.*`". Within the runtime: `create` is idempotent per sessionId (returns existing state); `respondToPermission` is exactly-once with typed duplicate errors; stream reconnects are safe at any cursor. The `agent_sessions` migration is forward-only but additive (a new table). Milestone 6 is a deletion PR — keep it separate and revertible.

## Interfaces and Dependencies

- `@anthropic-ai/claude-agent-sdk` `^0.3.205` — runtime dep of `packages/host-service`; types-only dep of `packages/session-protocol` (Decision D7).
- `packages/session-protocol` — the only chat/session contract import allowed in clients from Milestone 4 on.
- Host-service Hono app gains two routes (`/sessions/:id/stream` SSE + WS); tRPC router swaps `chat` → `sessions` at Milestone 6.
- Nothing in `packages/trpc` (cloud) or `apps/relay` changes.

---

Revision note (2026-07-09, initial): drafted from discovery of the mastra harness map, host-service/relay transport constraints, SDK 0.3.205 type audit, and Kirill's four scoping decisions (D1–D5 directional answers). Stream delivery mechanism (seq/cursor/journal) authored in response to the open "what if we miss stuff" question.

Revision note (2026-07-09, restored): this file briefly ceased to exist when the working plan was rewritten in place around the ACP direction. Restored verbatim from the session transcript as the competing "direct Claude Agent SDK" alternative, renamed from its timestamped filename to `session-harness-claude-agent-sdk.md`, code blocks converted to fenced style, and the status banner at the top added. See `packages/host-service/docs/acp-sessions.md` for the selected implementation.
