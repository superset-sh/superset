# V1 -> V2 Fast Migration Plan

A pragmatic plan to ship the v1 chat UX on top of the existing v2 host-service chat architecture. This is **not** the full event-log rearchitect from `v2-chat-greenfield-architecture.md`, and it should **not replace** the host-service chat work that already exists. The current host-service implementation is the foundation; this plan updates the remaining migration work around it.

## TL;DR

- **Keep** the existing host-service chat implementation:
  - `packages/host-service/src/runtime/chat/chat.ts`
  - `packages/host-service/src/trpc/router/chat/chat.ts`
  - `packages/host-service/src/providers/model-providers/`
  - `packages/workspace-client`
- **Keep** v1 client UX code where possible: `ChatPane`, `ChatPaneInterface`, `useChatPaneController`, `useChatDisplay`, composer, approval/question dialogs, model picker, MCP UI.
- **Do not move canonical session metadata into host-service.** Cloud remains the owner of `chat_sessions`; host-service owns local runtime execution.
- **Collapse** the dual-poll race with `getSnapshot()` on the existing host-service chat router, then wire clients to consume that snapshot.
- **Add a compatibility/adaptation layer** between v1's `chatRuntimeServiceTrpc.session.*` shape and host-service's `workspaceTrpc.chat.*` shape instead of rewriting host-service around v1.
- **Ship behind a per-workspace flag** so the old Electron IPC chat runtime remains a rollback path during bake.

Scope: roughly 1-2 weeks of implementation plus bake time, assuming the existing host-service chat runtime stays in place and the migration focuses on parity, adapter wiring, and rollout.

### Fixes at a glance

Quick scan of every concrete fix in this plan, ordered by priority. Each links to its phase below.

| # | Severity | Fix | Phase |
|---|---|---|---|
| 1 | HIGH | Runtime disposal on session delete (no leak) | P0 Fix #1 |
| 2 | HIGH | Cross-workspace `sessionId` race in runtime creation | P0 Fix #2 |
| 3 | MEDIUM | Collapse `getDisplayState` + `listMessages` into single `getSnapshot` | P1 |
| 4 | MEDIUM | Drop `fps: 60` polling override at `ChatPaneInterface.tsx:287` | P1 |
| 5 | MEDIUM | Update cloud `lastActiveAt` after host send (selector ordering) | P1 |
| 6 | MEDIUM | Implement slash command resolution (currently stubs) | P4 |
| 7 | MEDIUM | Add `searchFiles` for `@file` mention autocomplete (missing entirely) | P4 |
| 8 | MEDIUM | Wire `SessionStart` / `SessionEnd` / `UserPromptSubmit` hooks (Stop / Notification hooks deferred) | P4 |
| 9 | MEDIUM | Wire title generation via cloud `chat.updateTitle` | P4 |
| 10 | MEDIUM | Decide Superset MCP tools strategy (defer or port) | P4 |
| 11 | MEDIUM | Decide MCP overview / auth strategy (defer or port) | P4 |
| 12 | LOW | Real model-provider auth state (no hardcoded `isAnthropicAuthenticated = true`) | P4 |
| 13 | LOW | Optional: validate `(sessionId, workspaceId)` against cloud at runtime create | P0 (decision) |
| 14 | LOW | Mastra memory store guard in `restartFromMessage` | Lower-Risk Notes |
| 15 | LOW | Comment on `process.env` mutation in `applyRuntimeEnv` | Lower-Risk Notes |
| 16 | LOW | Confirm `protectedProcedure` end-to-end | Lower-Risk Notes |

P0 (HIGH) lands first as the prerequisite. P1 and P4 are independent of each other and can run in parallel after P0. P2-P3 (adapter, bootstrap migration) and P5-P6 (rollout, deletion) wrap around them.

## Current Host-Service Chat State

The host-service chat path already exists and should be preserved.

| Area | Current implementation | Notes |
|---|---|---|
| Runtime owner | `packages/host-service/src/runtime/chat/chat.ts` | `ChatRuntimeManager` owns in-memory `RuntimeSession` instances keyed by `sessionId`. It resolves `workspaceId -> worktreePath`, creates Mastracode runtimes, and exposes chat runtime methods. |
| Router | `packages/host-service/src/trpc/router/chat/chat.ts` | Mounted as `chat` in `packages/host-service/src/trpc/router/router.ts`. Uses host-service auth and calls `ctx.runtime.chat.*`. |
| App wiring | `packages/host-service/src/app.ts` | Creates `ChatRuntimeManager` and mounts it as `runtime.chat`. |
| Model provider bridge | `packages/host-service/src/providers/model-providers/` | `LocalModelProvider` and `CloudModelProvider` implement `ModelProviderRuntimeResolver` for runtime env preparation. |
| Renderer client | `packages/workspace-client` | `workspaceTrpc` talks to host-service over local HTTP. The v2 workspace route already uses this path. |
| Existing v2 consumer | `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/.../ChatPane` | Calls `workspaceTrpc.chat.*` directly with `{ sessionId, workspaceId }`. |
| Cloud session metadata | `packages/trpc/src/router/chat/chat.ts` | Cloud tRPC already has `createSession`, `deleteSession`, `updateTitle`, `uploadAttachment`, and `getModels`. |
| Legacy v1 runtime path | `packages/chat/src/server/trpc/service.ts` + Electron IPC router | Still powers the old `ChatPane` path today. |

The migration should converge the old v1 pane onto this host-service path without discarding the host-service runtime/router.

## Goals

1. **Host-service remains the single owner of local chat runtime execution.**
2. **Preserve v1 UX parity** while swapping the runtime transport under it.
3. **Close the dual-poll race** with a single snapshot query on host-service and the legacy IPC path during migration.
4. **Keep cloud as the canonical session metadata owner** for `chat_sessions`, titles, attachments, and models.
5. **Keep rollback simple** by routing per workspace through either the existing Electron IPC runtime or host-service.
6. **Avoid blocking greenfield work.** This plan should make the host-service boundary stable so event-log work can build on top of it.

## Non-Goals

- Not replacing or rewriting the existing host-service chat runtime.
- Not moving canonical `chat_sessions` ownership from cloud Postgres into host-service.
- Not introducing the event log, sequence numbers, gap detection, or a durable local chat store.
- Not solving multi-device ownership or session-host affinity end-to-end.
- Not removing the v2 workspace chat path. That path is the proof point for host-service chat and should continue to improve.
- Not making provider credential handling elegant in this migration. It only needs to preserve current working behavior and leave the cleaner abstraction for follow-up.

## Implementation Audit

Detailed walk of the existing host-service chat code, what's load-bearing, what's stubbed, and what's actually broken. The migration phases below reference this section.

### What's solid (don't rewrite)

1. **Mastra harness lifecycle** in `ChatRuntimeManager` — `init()` → `setResourceId()` → `selectOrCreateThread()` → event subscription. The structure is right.
2. **Concurrent-creation guard** via `runtimeCreations` map (lines 316, 442-450) prevents two requests for the same session from both spinning up runtimes — but see [Bug #2](#verified-bugs) below for a real defect in the keying.
3. **Error normalization** (lines 189-228) strips `AI_APICallError` prefix and extracts nested error messages. UX-load-bearing, easy to break, leave alone.
4. **Workspace DB resolution** at create time (line 392) — `workspaceId` → `worktreePath` lookup is cleaner than v1's `cwd` passthrough.
5. **Restart-from-message** (lines 247-310) uses Mastra's memory store correctly to clone the thread and re-send from a target message.
6. **AGENTS.md injection** (lines 359-381) only writes if missing or previously written by Superset — safe re-entrance.
7. **Model provider abstraction** (`CloudModelProvider` / `LocalModelProvider`) gates runtime creation on `hasUsableRuntimeEnv()` and tracks env keys for cleanup. Right shape.

### Stubbed in `ChatRuntimeManager` (lines 594-635)

```ts
getSlashCommands()      → []                                   // TODO
resolveSlashCommand()   → { handled: false }                   // TODO
previewSlashCommand()   → { handled: false }                   // TODO
getMcpOverview()        → { sourcePath: null, servers: [] }    // TODO
```

The router exposes these procedures and the v2 ChatPane renders the surfaces, so users see slash menus and MCP affordances that don't actually work.

### Missing from the router entirely

- **`searchFiles`** — v1 had `workspace.searchFiles` (delegated to `@superset/workspace-fs/host`). Without it, `@file` mention autocomplete is dead.
- **`authenticateMcpServer`** — v1 had OAuth callback for new MCP servers. With MCP currently stubbed anyway, this is downstream of `getMcpOverview`.

### Behaviors v1 runs that host-service runtime doesn't

| Behavior | v1 location | Host-service status |
|---|---|---|
| `runSessionStartHook()` after init | `packages/chat/src/server/trpc/utils/runtime/runtime.ts:130` | Not called. Host only sets hook session id at `chat.ts:408`. |
| `runSessionEnd()` on teardown | v1 hook manager | Not called. Also no teardown path exists. |
| `onUserPromptSubmit()` before send | v1 hook manager | Not called. |
| `getSupersetMcpTools()` loaded | v1 `service.ts:113-116` | Not loaded. |
| `generateAndSetTitle()` after first / 10th send | v1 `runtime.ts:457`, `service.ts:281` | Not called. |
| `subscribeToSessionEvents` with `onLifecycleEvent` callback | v1 | Only error / sandbox events surfaced; lifecycle callback not exposed. |
| `mcpManualStatuses` per-runtime tracking | v1 | Not present. |

### Contract differences (the adapter layer)

| Concern | v1 | Host-service |
|---|---|---|
| Session id input | `{ sessionId, cwd }` | `{ sessionId, workspaceId }` |
| Namespace | `session.*` + `workspace.*` (split) | `chat.*` (flat) |
| Approval reply | `session.approval.respond` | `chat.respondToApproval` |
| Question reply | `session.question.respond` | `chat.respondToQuestion` |
| Plan reply | `session.plan.respond` | `chat.respondToPlan` |
| File search | `workspace.searchFiles` | _missing_ |
| MCP auth | `workspace.authenticateMcpServer` | _missing_ |

The adapter layer is small but real: ~12 procedure renames, 2 missing procedures, payload-shape passthrough, and `cwd` → `workspaceId` resolution.

### Verified bugs

These are real defects in the current code, verified by reading the source. Listed in priority order.

1. **Runtime leak on session delete (HIGH).** `useWorkspaceChatController.ts:105` calls cloud `deleteSession` after a confirmation, but the host-service runtime in `ChatRuntimeManager.runtimes` (chat.ts:315) has no dispose path. The router has no `endSession` / `disposeRuntime` procedure (chat.ts:31). Each abandoned session leaks a `RuntimeSession` for the lifetime of the host-service process. **Fix:** add `chat.endSession({ sessionId, workspaceId })` mutation that calls a new `ChatRuntimeManager.disposeRuntime(sessionId)`, run any session-end hooks, then drop from the map. Wire the call after cloud `deleteSession` succeeds. Also wire it on workspace deletion.

2. **Cross-workspace sessionId race in runtime creation (HIGH).** `runtimeCreations` (chat.ts:316) is keyed by `sessionId` only. The check that an existing runtime's `workspaceId` matches the request (line 436) runs only on the *already-created* path, not on the *in-flight* path. So if creation for `(sessionId=X, workspaceId=A)` is mid-flight and a second request arrives for `(sessionId=X, workspaceId=B)`, the second request awaits the in-flight promise and receives a runtime bound to `workspaceA`. **Fix:** key the map by `${sessionId}:${workspaceId}`, or store the workspaceId on the in-flight promise and reject mismatches at line 442. Easy to fix, real bug under any concurrent-mount scenario (e.g., session opened in two windows).

3. **v2 ChatPane polls at 60 fps (MEDIUM).** `WorkspaceChatInterface/ChatPaneInterface.tsx:287` passes `fps: 60` to `useWorkspaceChatDisplay`, which clamps the refetch interval to ~16 ms (`useWorkspaceChatDisplay.ts:14-16`). Combined with the still-separate `getDisplayState` + `listMessages` queries, that's ~120 RPCs per second per active chat pane. **Fix:** the `getSnapshot` collapse from §The Race Fix kills both birds — single query, sane cadence (4 fps matches v1 default).

4. **Cloud `lastActiveAt` not updated on host send (MEDIUM).** `useWorkspaceChatController.ts:81` sorts the session selector by `lastActiveAt`. Host `sendMessage` (chat.ts:509) goes straight to the harness and never pings cloud. The cloud `chat_sessions.lastActiveAt` (`packages/trpc/src/router/chat/chat.ts:80`) only updates on metadata mutations. **Fix:** after a successful host send, host-service calls cloud `chat.updateSession({ lastActiveAt: now })` via its API client. Or: the v2 client fires a fire-and-forget cloud update alongside the host send. Either works; second is simpler.

5. **Sessionid ↔ workspaceId not validated against cloud (MEDIUM).** Host-service trusts authenticated local callers to pair any `sessionId` with any local `workspaceId`. It validates only that the local workspace row exists (chat.ts:391). The PSK limits exposure, but a stronger binding would validate against cloud `chat_sessions.v2WorkspaceId` either at session-create time or on first runtime creation. **Fix:** either (a) one-time validation at runtime creation that checks cloud `chat_sessions.v2WorkspaceId === workspaceId`, or (b) require cloud to issue a short-lived binding token that host accepts. (a) is enough for this migration.

6. **No host-service chat-specific tests.** Mastra harness behavior is exercised through other layers but the runtime manager has no targeted coverage for workspace binding, runtime reuse, snapshot consistency, or the bugs above. **Fix:** add tests as part of the corresponding fixes.

## The Race Fix

The highest-value behavior fix is still collapsing:

```ts
getDisplayState()
listMessages()
```

into:

```ts
chat.getSnapshot(input) -> {
  displayState: ChatDisplayState
  messages: Message[]
  observedAt: number
}
```

On host-service, implement this on top of the existing `ChatRuntimeManager`. It should read `displayState` and `messages` inside one router procedure and return one response. Because `listMessages()` is async, this is best described as a **single server-side observation**, not a fully locked atomic snapshot. It still removes the client-side two-query race that causes mismatched message/display state.

During migration, add the same procedure to the legacy Electron IPC runtime router so old-path users get the same client behavior.

## Ownership Model

| Concern | Owner during this migration |
|---|---|
| Local runtime execution | Host-service `ChatRuntimeManager` |
| Workspace cwd resolution | Host-service via `workspaceId` |
| Runtime credentials/env prep | Host-service model-provider resolver |
| Canonical chat session rows | Cloud tRPC / API |
| Session titles | Cloud tRPC `chat.updateTitle`, triggered by runtime owner when parity is restored |
| Attachments | Cloud tRPC `chat.uploadAttachment` |
| Old durable stream compatibility | Existing API routes until explicitly retired |
| Renderer UX | Existing v1 chat UI, adapted to host-service transport |

## Phased Migration

Each phase should be a separate PR or small PR stack.

### P0 - Critical Bug Fixes (Verified Bugs #1, #2)

**Goal:** close the two HIGH-severity defects in the existing host-service chat runtime before any rollout work. Both are surgical changes (≤50 lines each) and unblock everything else.

#### Fix #1 — Runtime disposal on session delete

References Verified Bug #1 in §Implementation Audit.

- [ ] Add `disposeRuntime(sessionId): Promise<void>` to `ChatRuntimeManager` (`packages/host-service/src/runtime/chat/chat.ts`):
  - [ ] Look up `RuntimeSession` by `sessionId`.
  - [ ] If present, run any session-end hook (placeholder ok if hook wiring lands later).
  - [ ] Call `harness.abort()` and any `harness.destroy()` / cleanup the harness exposes.
  - [ ] Delete from `runtimes` map.
  - [ ] Idempotent — disposing an unknown session id is a no-op.
- [ ] Add `chat.endSession({ sessionId, workspaceId })` mutation to `packages/host-service/src/trpc/router/chat/chat.ts`.
- [ ] Wire client call sites:
  - [ ] `useWorkspaceChatController.ts:105` (after cloud `deleteSession` succeeds).
  - [ ] Workspace deletion flow — when a workspace is deleted, dispose all runtimes for sessions bound to it.
- [ ] Test: dispose then re-send to the same `sessionId` creates a fresh runtime; the map size returns to baseline after dispose.

#### Fix #2 — Cross-workspace sessionId race in runtime creation

References Verified Bug #2 in §Implementation Audit.

- [ ] In `ChatRuntimeManager` (`chat.ts:316`), change `runtimeCreations` keying from `string` (sessionId) to `${sessionId}:${workspaceId}` — OR — keep the sessionId key and store `{ workspaceId, promise }` so awaiting code can validate the workspace match before returning.
- [ ] Apply the same workspace-mismatch guard that exists for already-created runtimes (`chat.ts:436`) to the in-flight path (`chat.ts:442`). A request whose `workspaceId` does not match the in-flight creation's workspace must throw, not silently get the wrong runtime.
- [ ] Test: concurrent calls with `(sessionId=X, workspaceId=A)` and `(sessionId=X, workspaceId=B)` resolve to two distinct runtimes (or one rejects with a clear "session bound to other workspace" error). Today's behavior silently shares the in-flight promise.

#### General hardening

- [ ] Add lightweight tests for the existing happy paths so regressions don't sneak in alongside the bug fixes:
  - [ ] workspace-bound runtime creation
  - [ ] same `sessionId` reused in same workspace returns the same runtime
  - [ ] router procedures call the runtime manager with `{ sessionId, workspaceId }`

**Acceptance:** runtime leaks are gone, cross-workspace race cannot happen, basic test coverage exists for the manager.

### P1 - Add `getSnapshot` And Fix Polling Cadence (Verified Bugs #3, #4)

**Goal:** one query per poll cycle, sane cadence, and host-side cloud `lastActiveAt` updates so the session selector keeps reordering correctly.

#### Snapshot procedure

- [ ] Add `workspaceTrpc.chat.getSnapshot({ sessionId, workspaceId })` to host-service. Returns `{ displayState, messages, observedAt }` from a single handler invocation.
- [ ] Add legacy `chatRuntimeServiceTrpc.session.getSnapshot` to the Electron IPC runtime path with the same shape.
- [ ] Implementation note: read `displayState` and `listMessages()` inside one router function; one server-side observation, not a fully locked atomic snapshot. Document this in code.

#### Client cutover

- [ ] Update host-service-backed v2 chat display (`useWorkspaceChatDisplay`) to consume `getSnapshot`.
- [ ] Update shared/v1 `useChatDisplay` to consume legacy `getSnapshot`.
- [ ] Update optimistic-message cache writes to target the snapshot cache, or invalidate/refetch the snapshot after cross-session sends.
- [ ] Keep `getDisplayState` and `listMessages` alive on both surfaces until every caller is migrated; delete in P6.

#### Polling cadence (Verified Bug #3)

- [ ] Drop the `fps: 60` parameter at `ChatPaneInterface.tsx:287`. Default in `useWorkspaceChatDisplay` is `fps: 4`, which matches v1 and is the right cadence for a polled chat. 60 fps means ~120 RPCs/sec per active pane today.
- [ ] Confirm there are no other call sites passing high `fps`. Grep `useWorkspaceChatDisplay` callers; flag any non-default `fps` for review.

#### Cloud `lastActiveAt` update on host send (Verified Bug #4)

- [ ] After a successful host `sendMessage`, update cloud `chat_sessions.lastActiveAt` so the session selector (`useWorkspaceChatController.ts:81`) keeps reordering after activity. Two viable shapes:
  - [ ] **Host-side**: host-service's API client calls cloud `chat.updateSession({ sessionId, lastActiveAt: now })` after a successful send. Single source of truth, no extra client code.
  - [ ] **Client-side**: v2 client fires a fire-and-forget `apiTrpcClient.chat.updateSession` alongside the host send.
- [ ] Pick one (recommend host-side) and implement. Verify selector reorders after a send.

**Acceptance:** client chat display uses one polling query on both old and host-service paths, default polling is 4 fps, sending a message reorders its session to the top of the selector.

### P2 - Add V1 Compatibility Adapter For Host-Service

**Goal:** allow the old `ChatPane` UX to talk to host-service without reshaping host-service around the v1 router.

- [ ] Add a client-side adapter or provider resolver that exposes the v1 command surface while internally calling `workspaceTrpc.chat.*`.
- [ ] Map v1 `{ sessionId, cwd }` inputs to host-service `{ sessionId, workspaceId }` inputs at the renderer boundary.
- [ ] Keep v1 UI components unchanged where possible.
- [ ] Ensure `sendMessage`, `restartFromMessage`, `stop`, approvals, questions, plans, and snapshot reads all route through the adapter.
- [ ] Add a per-workspace flag to choose Electron IPC runtime vs host-service runtime.
- [ ] Add a dev-only backend indicator for QA.

**Acceptance:** flipping the flag for a workspace switches v1 chat runtime traffic to host-service with the same visible UI.

### P3 - Move V1 Session Bootstrap Off REST, But Keep It Cloud-Owned

**Goal:** stop `useChatPaneController` from calling `/api/chat/[sessionId]` directly while keeping canonical metadata in cloud.

- [ ] Replace v1 `fetch('/api/chat/:sessionId')` session create/delete calls with cloud tRPC `apiTrpcClient.chat.createSession` / `deleteSession`.
- [ ] If v1 workspaces still need the legacy `workspaceId` column instead of `v2WorkspaceId`, extend cloud tRPC carefully rather than moving this concern to host-service.
- [ ] Keep REST routes alive for one release as compatibility/fallback because they also manage durable-stream behavior.
- [ ] Preserve `createSessionInitRunner` retry/toast/reporting behavior.
- [ ] Verify session listing still flows through Electric `chatSessions` collections.

**Acceptance:** fresh v1 clients no longer call the REST session bootstrap routes, but cloud remains the session metadata owner.

### P4 - Fill Host-Service Parity Gaps

**Goal:** make the host-service path match v1 behavior closely enough for canary. References the gap list in §Implementation Audit.

#### Slash commands (currently stubs at `chat.ts:594-635`)

- [ ] Port slash-command discovery/resolution from `packages/chat/src/server/desktop/slash-commands/` to host-service.
- [ ] Implement `getSlashCommands` so it returns project + global commands (instead of `[]`).
- [ ] Implement `resolveSlashCommand` and `previewSlashCommand` so prompts substitute correctly (instead of `{ handled: false }`).
- [ ] Verify project-scoped (`.claude/commands`, `.agents/commands`) and global (`~/.claude/commands`) sources both resolve.

#### File mention search (missing from router entirely)

- [ ] Add `chat.searchFiles({ workspaceId, query, ... })` procedure to host-service.
- [ ] Wire to `@superset/workspace-fs/host` (already used elsewhere). Match v1's `workspace.searchFiles` shape so the renderer adapter is trivial.
- [ ] Verify `@file` mention autocomplete works in the host-service-backed chat pane.

#### Session lifecycle + user-prompt hooks (currently uncalled)

Scope: `SessionStart`, `SessionEnd`, `UserPromptSubmit` only. **`Stop` and `Notification` hook events are intentionally deferred** — they aren't blocking for canary, they overlap with agent-status UI plumbing we're not chasing in this migration.

- [ ] In `ChatRuntimeManager.createRuntime` (after `setResourceId`, around line 408): call `runSessionStartHook()` analogous to v1 `runtime.ts:130`.
- [ ] In `ChatRuntimeManager.disposeRuntime` (added in P0 Fix #1): call `runSessionEnd()` before tearing down.
- [ ] In `ChatRuntimeManager.sendMessage` (line 509): call `onUserPromptSubmit()` before delegating to harness; respect a "blocked" return.
- [ ] Reload hook config on session re-access (matches v1 `reloadHookConfig`).
- [ ] Verify a user-defined `.claude/*.hooks.ts` `SessionStart` / `UserPromptSubmit` / `SessionEnd` hook actually fires.

#### Title generation (currently not called)

- [ ] Wire `generateAndSetTitle()` after the first user message and every 10th message — analogous to v1 `runtime.ts:457` and `service.ts:281`.
- [ ] Persist via cloud tRPC `chat.updateTitle({ sessionId, title })` so titles survive across devices.

#### Superset MCP tools (currently not loaded)

- [ ] Decide product policy: do host-service-backed chat sessions get Superset's built-in MCP tools (analytics queries etc.), or only user-configured MCP?
- [ ] If yes: load `getSupersetMcpTools()` analogous to v1 `service.ts:113-116` during runtime creation.
- [ ] If no: explicitly note in code so the gap isn't accidentally re-opened.

#### MCP overview / authentication (currently stubbed)

- [ ] Decide the MCP strategy for canary:
  - [ ] **Defer**: keep `getMcpOverview` returning empty and hide/limit the MCP UI surfaces in v2-workspace ChatPane so users don't see broken affordances. v1 already shipped with `ENABLE_MASTRA_MCP_SERVERS = false`, so this is a credible default.
  - [ ] **Port**: implement `getRuntimeMcpOverview()` and `authenticateRuntimeMcpServer()` on host-service equivalents.
- [ ] If deferring: track Mastra MCP enable as separate follow-up.

#### Lifecycle event forwarding — deferred

`subscribeToSessionEvents` `onLifecycleEvent` callbacks (agent start/stop, permission request notifications, etc.) are out of scope. Polling `getSnapshot` already covers what the UI needs for canary; push-style lifecycle notifications belong with the event-log work in `v2-chat-greenfield-architecture.md`.

#### Model-provider auth / status UI

- [ ] Verify the model picker doesn't claim a provider is authenticated when host-service can't actually run it. Today some places hardcode `isAnthropicAuthenticated = true`. Plumb the real auth state through `LocalModelProvider.hasUsableRuntimeEnv()`.

**Acceptance:** known v1 behaviors either work on host-service or have an explicit product decision to defer (with the deferred ones surfacing no broken UI).

### P5 - Canary And Rollout

**Goal:** ship host-service-backed chat safely.

- [ ] Dogfood host-service chat for developer workspaces.
- [ ] Canary a small percentage of real workspaces.
- [ ] Monitor chat error rate, runtime creation failures, provider credential failures, and Sentry.
- [ ] Keep rollback as a flag flip back to Electron IPC.
- [ ] Bake for at least one release before deleting legacy paths.

**Acceptance:** host-service chat handles the majority of canary traffic without elevated errors or parity regressions.

### P6 - Delete Legacy Runtime Paths

**Goal:** one runtime owner.

- [ ] Delete the Electron-main `chatRuntimeService` runtime router after the host-service path is default-on and stable.
- [ ] Delete legacy dual-query procedures after every caller uses `getSnapshot`.
- [ ] Delete the client adapter/flag once host-service is the only target.
- [ ] Revisit `/api/chat/[sessionId]` and durable-stream routes separately. Delete them only after confirming no remaining durable-stream consumers.
- [ ] Update docs to point to host-service chat as the runtime owner.

**Acceptance:** runtime chat traffic goes only through host-service; cloud still owns session metadata unless a separate migration changes that.

## Lower-Risk Notes

Items that aren't outright bugs but should be verified during the migration. The Verified Bugs in §Implementation Audit are the load-bearing ones; these are the next tier.

1. **Provider credentials parity.** `LocalModelProvider` reads keychain + mastracode auth storage + `~/.mastracode` config. Verify it covers every credential source the legacy desktop chat service supports (managed env config, backup slots, OAuth refresh) before flipping the flag for users with non-standard auth setups.
2. **Provider env mutation.** `applyRuntimeEnv()` mutates `process.env` globally. Concurrent runtimes for different model providers could in theory race on env keys. One provider per host-service install today, so probably fine in practice — but worth a comment in the code so a future contributor doesn't re-trip on it.
3. **Mastra memory-store assumption** in `restartFromMessage` (lines 230-245). Throws cryptically if storage isn't configured. Add a guard with a clearer error.
4. **`protectedProcedure` end-to-end check.** Confirm the chat router's `protectedProcedure` actually validates auth and that `ctx.organizationId` is populated where expected. The audit didn't trace this fully.
5. **Snapshot semantics communication.** `getSnapshot` is a single server-side observation, not an event-log atomic snapshot. Good enough for this migration; document that explicitly so anyone reading later doesn't oversell it as final consistency.

## Relationship To Greenfield Plan

This migration stabilizes the host-service runtime boundary that `v2-chat-greenfield-architecture.md` wants to build on. After this lands:

- the event-log work can attach to host-service `ChatRuntimeManager`;
- `getSnapshot` becomes a temporary bridge until subscriptions/event-log reads replace polling;
- legacy Electron IPC runtime ownership can be deleted without redoing the host-service migration.

## Summary

Keep the existing host-service chat runtime and router. Add snapshot reads, a v1 compatibility adapter, cloud-owned session bootstrap cleanup, parity work, and a flag-based rollout. The old plan was written as if host-service chat still needed to be created; this version treats it as already present and worth preserving.
