# Claude Agent SDK sessions: a parallel harness beside mastra (host + mobile)

> **Status: selected implementation direction as of 2026-07-09.** The earlier [ACP adapter implementation](./session-harness-acp.md) remains as a tested retrospective and source for backend-neutral delivery/UI work. This worktree uses the Claude Agent SDK directly: host-service owns the SDK `Query`; no ACP adapter, ACP JSON-RPC layer, or ACP-shaped client contract ships.
>
> Four later scope decisions apply to this selected execution: (1) ship **parallel to mastra**, not as a replacement — mastra is in production on desktop; the excision and desktop UI migration move to a later hard-swap plan; (2) keep session processes alive for the host-service lifetime — no idle disposal; (3) list live sessions only — dead sessions disappear, with no restart-resume product requirement or SQLite registry; (4) use host-machine Claude credentials without allowing Superset-injected development dotenv values to override a user's explicit environment. The exact credential-environment provenance policy is frozen pending review (D9).

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` and the ExecPlan template in `.agents/`.

## Current execution directive

This section overrides stale replacement/resume language later in the restored draft:

- Ship **parallel to mastra**. Host-service + mobile are in scope; desktop migration and mastra excision are not.
- Keep a live session process for the host-service lifetime. Dead sessions disappear from `list`; no SQLite registry or restart-resume product flow in v1.
- Pin the newest Claude Agent SDK version allowed by the repository's three-day release-age policy. This worktree starts on `0.3.202`.
- Mirror serializable SDK concepts across the host RPC: raw `SDKMessage` events; `sendMessage`, `interrupt`, `setModel`, `setPermissionMode`, catalog/history reads, and typed SDK callback responses.
- Keep SDK callback families honest. `canUseTool`, `onUserDialog`, and `onElicitation` get distinct pending/request response shapes rather than being flattened into ACP-style permission options.
- Reuse the proven sequence journal, cursor replay/reset, relay WebSocket transport, admission-only message acknowledgement, workspace ownership, and mobile UI shell from the ACP experiment.
- Use Claude's native transcript as history truth; the Superset journal is bounded live-delivery recovery, not a second durable transcript.
- Do not finalize credential filtering until environment ownership is explicit. Preserve user-provided `ANTHROPIC_*` values and remove only values Superset can prove it injected.

## Purpose / Big Picture

Today every AI chat session in Superset is executed by `mastracode` (the "mastra harness"), wrapped twice — once in the desktop Electron main process and once in the host-service — and every client learns about session progress by polling snapshots at 250ms. Message history lives inside mastra's private memory store, the host cannot report which model a session is running, and mobile talks to the host through a hand-written, lossy type facade that nothing enforces.

After this change:

- The **host-service is the single owner** of each new Claude SDK session process. Existing mastra owners stay in place on their current paths.
- A new **`packages/session-protocol`** package is the shared contract: Claude SDK types re-exported type-only, plus Superset-owned state, callback frames, sequence envelopes, native-history folds, and SDK-shaped RPC schemas.
- Mobile and future clients attach via the host's tRPC API for state/history/actions and a **resumable, sequence-numbered WebSocket stream** through the relay. Any authenticated attached client can send messages, answer callback requests, switch model or permission mode, and interrupt.
- **mastracode and existing `@mastra/*` dependencies remain untouched.** The new path is additive. The contract retains only a narrow `harness` discriminator for a possible future provider.

Demonstrable outcome for this worktree: start or attach to a Claude SDK session from a distinct mobile route, stream SDK messages through the relay without polling, answer `AskUserQuestion`/plan/tool callbacks, change model or permission mode, interrupt a turn, and repair a dropped or stale stream from the bounded journal plus native transcript history. Host restart/resume and desktop UI migration are deferred.

## Assumptions

- The Claude Agent SDK is pinned exactly to `@anthropic-ai/claude-agent-sdk@0.3.202`, the newest release eligible under the repository's three-day minimum release-age rule when implementation began. Production uses streaming-input `query()`, distinct SDK callbacks, raw `SDKMessage` delivery, Query controls, and native transcript history.
- Sessions authenticate on the host machine. The spike proved the existing Claude Code OAuth/Max login works, but the final child environment must preserve a user's explicit `ANTHROPIC_*` values while excluding only values Superset itself injected. That provenance policy is deliberately not finalized yet.
- Existing mastra `chat_sessions` rows and their Electric sync remain unchanged. Claude SDK sessions do not create cloud directory rows; mobile lists their live host runtimes directly through `sessions.list`.
- Desktop already spawns the host-service as a child process for local use (`apps/desktop/src/main/host-service/index.ts`), so "desktop attaches to host-service" requires no new process infrastructure.

## Open Questions

- **Q1 — Anthropic credential environment provenance.** The host login path works. The remaining question is how the desktop/host records whether a given `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` came from the user versus Superset/root dotenv. `process.env` and `Options.env` do not retain provenance after merging, so no implementation may infer ownership from the variable name alone. → D9, frozen pending review.
- **Q2 — Web app (`apps/web`) migration.** It talks to the host with hand-rolled fetch calls today. Out of scope here unless trivially cheap after Milestone 3; confirm. → Decision Log D10 placeholder. *(Resolved later: out of scope.)*
- **Q3 — Idle process policy.** One Claude subprocess per active session; propose dispose after 30 minutes idle and resume on demand via `Options.resume` (cheap because transcripts persist as JSONL). Needs product sign-off on the resume latency tradeoff (~1–3s to respawn). → Decision Log D11 placeholder. *(Resolved later: no disposal — keep alive forever.)*
- **Q4 — Retention/GC of JSONL transcripts** on the host disk. Not blocking; decide before GA. → Decision Log D12 placeholder. *(Resolved later: out of scope.)*

## Progress

- [x] (2026-07-09 18:00Z) Discovery: mapped mastra harness call sites, host-service transport, relay streaming constraints, SDK 0.3.205 surface.
- [x] (2026-07-09 18:30Z) Clarified scope, transport, type-lift, and migration strategy with Kirill (see Decision Log D1–D8).
- [x] (2026-07-09) Created a clean worktree from fetched `upstream/main`; left the dirty ACP trajectory on the main checkout untouched and copied both plans here as evidence.
- [x] (2026-07-09) Milestone 0: direct SDK spike passed all 11 exercises against the host's real Claude login, including multi-turn input, permissions, `AskUserQuestion`, plan mode, controls, interruption, native history/resume, and cleanup.
- [x] (2026-07-09) Milestone 1: added `@superset/session-protocol` with raw SDK types, SDK-shaped validation, native-history folds, sequence envelopes, and reconnect/dedup/gap/reset behavior.
- [x] (2026-07-09) Milestone 2: added the direct `ClaudeSessionManager`, distinct callback queues, history pagination, `sessions` tRPC router, app wiring, and deterministic Query-fake coverage.
- [x] (2026-07-09) Milestone 3 (selected scope): added the relay-compatible WebSocket stream, bounded replay/reset, backpressure closure, dynamic reconnect URL/token support, and per-subscriber failure isolation. SSE was not needed for the selected mobile path.
- [ ] Milestone 4 (selected scope): prove the target-specific SDK executable is materialized outside ASAR and resolves from the packaged desktop host-service child. Desktop chat UI migration stays deferred.
- [ ] Milestone 5: finish and verify the distinct mobile Claude route, HTTP/WS adapter, transcript resync, timeline rendering, callback responses, and controls.
- [ ] Final validation: root lint/typecheck, affected tests/builds, a live host-manager smoke where safe, and a clear record of the frozen auth-provenance boundary.
- [ ] Deferred: desktop UI migration, mastra excision, host-restart resume/registry, web, SSE, and transcript GC.

## Surprises & Discoveries

- Observation: the relay cannot stream HTTP responses — `sendHttpRequest` in `apps/relay/src/tunnel.ts` buffers one complete `TunnelHttpResponse` per request, so SSE cannot traverse the relay. The relay *does* proxy arbitrary WebSocket channels (`openWsChannel`/`sendWsFrame`, used by `/terminal/*` today).
  Evidence: `apps/relay/src/tunnel.ts:343-404`.
- Observation: `packages/chat-protocol` and `packages/durable-session` are referenced in `AGENTS.md` but do not exist as directories; the earlier "SCP v1" normalized-envelope design was never built. This plan supersedes it (Decision D2).
- Observation: the Claude SDK surfaces AskUserQuestion, plan approval (ExitPlanMode), and ordinary tool approvals all through the single `canUseTool` callback, and ships typed tool input/output schemas at `@anthropic-ai/claude-agent-sdk/sdk-tools` (types-only export). Today's three parallel pending flows (approval / question / plan) collapse into one `PendingPermissionRequest` model.
- Observation: `SessionMessage` objects returned by `getSessionMessages` carry a runtime `timestamp` field that is absent from the declared type; and `getSessionMessages` omits system messages unless `includeSystemMessages: true` (needed to render compaction boundaries).
- Observation: the direct live spike passed 11/11 exercises. `system/init.apiKeySource` was runtime `"none"` for a first-party Claude Max account despite the declared SDK union; interrupt completed in about 1.2 seconds with an aborted-streaming result and the next turn remained usable; all 196 core frames carried UUID/session identifiers.
- Observation: relocating `CLAUDE_CONFIG_DIR` breaks the existing Claude login even when `.claude.json` is copied, producing an assistant auth error followed by a misleading successful result. Production must use the user's normal Claude configuration directory unless a complete supported migration exists.
- Observation: `Options.env` is a flat child environment with no provenance, and Node's `process.env` cannot distinguish user exports from root dotenv/Electron injection after merging. Filtering therefore requires an upstream ownership marker or clean user-shell snapshot; unconditional deletion by variable name is unsafe.
- Observation: `onUserDialog` is opt-in twice: a callback alone receives nothing unless `supportedDialogKinds` declares exact kinds the UI genuinely supports. V1 does not claim a live dialog kind; tool/question/plan interactions arrive through `canUseTool`, and MCP forms/URL auth through `onElicitation`.
- Observation: one stream subscriber originally could throw from serialization or `socket.send`, escape into the shared Query pump, and mark the whole session errored. Delivery is now isolated per subscriber; the failed socket closes and journal replay repairs it without affecting other clients.

## Decision Log

- Decision D1: The new runtime lives **only in host-service**; desktop is just another attached client (via its locally spawned host-service).
  Rationale: single process owner, single codepath, matches the multi-client requirement.
  Date/Author: 2026-07-09 / Kirill.
- Decision D2: The wire protocol carries **Claude SDK events verbatim** inside a thin envelope, and `packages/session-protocol` **re-exports SDK types** (type-only) rather than normalizing them.
  Rationale: zero drift, zero translation bugs; the mobile facade's manual-sync failure mode is exactly what we're eliminating. Supersedes the unbuilt SCP v1 normalization design.
  Date/Author: 2026-07-09 / Kirill.
- Decision D3: the direct SDK path ships **parallel to mastra**. No existing runtime, dependency, route, or thread is removed in this worktree.
  Rationale: desktop mastra is already production behavior; this worktree proves the host/mobile direct path without broadening into a hard swap.
  Date/Author: 2026-07-09 / Kirill.
- Decision D4: Future-proofing for Codex is limited to a `harness` discriminator (`'claude'` now, `'codex'` later) on session state and on `sdk`-kind stream events. No abstraction layers are built for a harness that doesn't exist yet.
  Rationale: YAGNI; the envelope makes room without cost.
  Date/Author: 2026-07-09 / Kirill + Claude.
- Decision D5: the selected client uses **WebSocket through the relay**, carrying sequence-numbered envelope frames. Delivery is at-least-once with client dedup by `seq`; gaps and unavailable/ahead cursors heal via state/native-history resync. No relay changes and no SSE implementation are required in this scope.
  Rationale: WebSocket already traverses the relay frame-by-frame; the bounded journal and cursor protocol supply the missing delivery guarantees.
  Date/Author: 2026-07-09 / Kirill (directional) + Claude (mechanism).
- Decision D6: **Transcript truth is the Claude SDK's native JSONL persistence** on the host (`~/.claude/projects/...`), read through `getSessionMessages`. The Superset journal is only bounded live-delivery recovery. No host SQLite session registry and no restart-resume product flow ship in v1; the SDK's alpha `SessionStore` is not used.
  Rationale: native history avoids a duplicate transcript while a live-only host runtime keeps v1 lifecycle semantics explicit.
  Date/Author: 2026-07-09 / Claude, open to challenge.
- Decision D7: `packages/session-protocol` depends on `@anthropic-ai/claude-agent-sdk` as a regular dependency but only ever `import type`s it (plus the pure-types `/sdk-tools` subpath). Its shipped runtime code is zod schemas and the small stream-client helper — all React-Native-safe. Enforcement: a lint-greppable rule, `import { ... } from '@anthropic-ai/claude-agent-sdk'` (non-type) is forbidden in this package.
  Rationale: type-only imports are erased at compile time, so Metro never bundles the SDK; bun workspace hoisting means the SDK is installed once at the repo root anyway (host-service needs it for real).
  Date/Author: 2026-07-09 / Kirill.
- Decision D8: preserve the SDK callback families: tool approvals, `AskUserQuestion`, and `ExitPlanMode` share `PendingPermissionRequest` because the SDK delivers them through `canUseTool`; `onUserDialog` and `onElicitation` keep distinct pending/response types and RPCs.
  Rationale: this mirrors the SDK instead of flattening unrelated callbacks into ACP-shaped choices.
  Date/Author: 2026-07-09 / Claude.
- Decision D9: the host's existing Claude login works, but final environment filtering is **unresolved and frozen**. Preserve user-set `ANTHROPIC_*`; exclude a value only when Superset can prove it injected that exact value. Never infer ownership by variable name after environments were merged.
  Date/Author: 2026-07-09 / Kirill.
- Decision D10: web migration is out of scope.
- Decision D11: live Query processes remain alive for the host-service lifetime; dead sessions disappear and are not resumed by a Superset registry.
- Decision D12: transcript retention/GC is out of scope for this worktree.

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
- **Electric / `chat_sessions`**: cloud Postgres table (in `packages/db`) synced read-only to clients; it remains the cross-device list for existing mastra chats. Claude SDK sessions are deliberately absent from it and appear only while their host runtime is live.

What exists today and remains intact beside the new path:

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

### Relationship to the earlier ACP implementation

The [canonical end-to-end comparison](./session-harness-acp.md#end-to-end-comparison-acp-vs-direct-claude-agent-sdk) lives in the ACP retrospective so the two documents do not carry duplicate matrices that drift. The selected direct design preserves the proven topology and v1 lifetime rules while changing the host-local ownership boundary:

| Dimension | Earlier ACP implementation | Selected direct-SDK implementation |
|---|---|---|
| Agent owner | Adapter child owns the SDK Query; host speaks ACP over stdio. | Host owns the SDK Query and input queue directly. |
| Client delivery | ACP updates are wrapped in Superset seq envelopes. | SDK messages must be normalized into equivalent Superset envelopes. |
| Human interaction | Tool/plan approvals work today; structured questions require ACP form elicitation to be wired. | Tool approvals, plan approval, and `AskUserQuestion` all park in `canUseTool` callbacks directly. |
| Settings/control | Adapter-reported config and mode operations. | Direct Query methods and host-authored state projection. |
| Reconnect | Host journal + cursor replay/reset. | Same host journal + cursor replay/reset; no SDK resume is involved in a client reconnect. |
| Process death/restart | Dead sessions disappear; host restart loses them. | Same final v1 behavior despite the SDK's optional persisted resume capabilities. |
| Cost/risk | Extra process/translation layer and adapter/integration capability lag; less Superset-owned protocol code. | Fewer runtime layers and fastest SDK feature access; more custom lifecycle, normalization, and vendor coupling. |

The direct path was selected because it removes an extra process/translation layer, exposes SDK callbacks and controls immediately, and lets the Superset RPC mirror Claude's SDK rather than ACP. The ACP work remains useful evidence for transport, journal, relay, and mobile-shell behavior.

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
  sessionId: string;            // Superset live-session id; not persisted to chat_sessions
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
- `sendMessage` pushes into the input queue of the already-live Query. Dead or exited runtimes reject mutations and disappear from `list`; v1 never recreates or resumes them. Model/effort changes ride either the dedicated procedures (`setModel` → `query.setModel`) or per-message metadata for parity with today's UX; both end with a `state` broadcast so **every attached client sees the authoritative current model** (fixes the gap called out in PR #5536).
- `respondToPermission({ requestId, response })` resolves the deferred exactly once; late duplicates from other clients get a typed `ALREADY_RESOLVED` error; resolution broadcasts `permission_resolved` + `state`.
- No registry: `sessions.list` reads the manager's in-memory runtime map. The native Claude transcript can hydrate the UI while that runtime remains live, but Superset stores no public-to-native session binding and performs no host-restart recovery.

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
- Desktop UI migration is deferred. The existing mastra desktop path remains untouched; only the host-service child packaging required to execute the direct SDK is in scope.
- Mobile gets a distinct, reachable Claude SDK route beside the existing mastra route. It imports `@superset/session-protocol`, initializes state/history over tRPC, follows the relay WebSocket with cursor repair, and renders SDK-native messages and callback interactions.

### The excision

Delete: `packages/host-service/src/runtime/chat/` + `src/trpc/router/chat/`; `packages/chat/src/server/trpc/` (service, zod, runtime utils) + `src/client/hooks/use-chat-display/`; `apps/desktop/src/lib/trpc/routers/chat-runtime-service/`; `apps/desktop/src/main/lib/agent-setup/agent-wrappers-mastra.ts`. Remove `mastracode`, `@mastra/core`, `@mastra/memory`, `@mastra/mcp` from all three package.jsons. Repoint the v1 desktop chat panes (`apps/desktop/src/renderer/components/Chat/**`, `ChatPane`) at the local host-service using the same new hook as v2 — desktop main already knows the host-service port via the coordinator. Audit what survives in `packages/chat`: slash-command tokenizers (`/shared`) and title generation stay if mastra-free; provider-credential machinery in `ChatService` shrinks to whatever Decision D9 requires. Grep gate: `grep -ri "mastra" --include="*.ts" -l` returns only historical plans/docs.

## Milestones

### Milestone 0 — Spike: SDK under host-service conditions (timebox: half a day)

Additive and isolated (a script under `packages/host-service/scripts/`, not production code). Prove on a real workspace worktree: spawn `query()` streaming-input with `cwd` set; observe `system:init` (session id, model); send two messages across one process; trigger `canUseTool` (a Bash command) and resolve it programmatically; trigger AskUserQuestion and answer via `updatedInput`; kill the script and `resume` the session with history intact via `getSessionMessages`. Resolve Q1 (credential source) by testing both auth paths. Outcome recorded in Surprises & Discoveries + Decision D9.

### Milestone 1 — `packages/session-protocol`

The package as specified above, plus unit tests for zod schemas and cursor encoding (`bun test packages/session-protocol`). Register in workspaces, `bun run typecheck` green. Acceptance: `apps/mobile` can add it as a dependency and `bun run --cwd apps/mobile typecheck` stays green (proves the RN type-only story).

### Milestone 2 — SessionManager + `sessions` router

Host-service runs Claude sessions end-to-end, queryable without any streaming: `sessions.create` → `sendMessage` → `get`/`getMessages` shows the turn; `respondToPermission` unblocks a Bash approval; and `list` paginates live runtimes. A fresh manager has an empty list and creates a fresh native session even if given a previously used public id. Acceptance: an integration test against a temp workspace + manual curl transcript (see Concrete Steps). The old `chat` router still exists and is untouched — both routers coexist until Milestone 6.

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

The end-to-end acceptance for the whole plan is the Purpose scenario: mobile drives one host-owned session, receives its live stream, reconnects with cursor replay, and rehydrates native history after a client relaunch while the host runtime remains alive. Host-service restart intentionally clears the Claude SDK session list. Each milestone above carries its own narrower acceptance; do not proceed past a milestone whose acceptance has not been demonstrated.

## Idempotence and Recovery

All milestones are additive until Milestone 6; the old mastra path keeps working alongside the new router the whole time, so rollback before M6 is "stop routing to `sessions.*`". Within the runtime: `create` is idempotent per sessionId (returns existing state); `respondToPermission` is exactly-once with typed duplicate errors; stream reconnects are safe at any cursor. The `agent_sessions` migration is forward-only but additive (a new table). Milestone 6 is a deletion PR — keep it separate and revertible.

## Interfaces and Dependencies

- `@anthropic-ai/claude-agent-sdk` `^0.3.205` — runtime dep of `packages/host-service`; types-only dep of `packages/session-protocol` (Decision D7).
- `packages/session-protocol` — the only chat/session contract import allowed in clients from Milestone 4 on.
- Host-service Hono app gains two routes (`/sessions/:id/stream` SSE + WS); tRPC router swaps `chat` → `sessions` at Milestone 6.
- Nothing in `packages/trpc` (cloud) or `apps/relay` changes.

---

Revision note (2026-07-09, initial): drafted from discovery of the mastra harness map, host-service/relay transport constraints, SDK 0.3.205 type audit, and Kirill's four scoping decisions (D1–D5 directional answers). Stream delivery mechanism (seq/cursor/journal) authored in response to the open "what if we miss stuff" question.

Revision note (2026-07-09, restored): this file briefly ceased to exist when the working plan was rewritten in place around the ACP direction. Restored verbatim from the session transcript as the competing "direct Claude Agent SDK" alternative, renamed from its timestamped filename to `session-harness-claude-agent-sdk.md`, code blocks converted to fenced style, and the status banner at the top added. See `session-harness-acp.md` for the selected approach.
