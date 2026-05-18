---
stability: mixed (CONSTITUTION + FEATURE_SPEC — see 03-functional-groups.md)
last_validated: 2026-05-18
prd_version: 1.0.0
functional_group: RUN
---

# Use Cases: v2 Mastra Runtime Polish (RUN)

| ID | Title | Source Finding | Layer |
|----|-------|----------------|-------|
| UC-RUN-01 | Scope model-provider credentials per `createMastraCode` invocation | V2-H3 CRITICAL | CONSTITUTION |
| UC-RUN-02 | Resolve the `abort` no-op stub: commit to `stop`-only contract | V2-H1 stub | FEATURE_SPEC |
| UC-RUN-03 | Resolve `getMcpOverview` stub: remove or implement | V2-H2 stub | FEATURE_SPEC |
| UC-RUN-04 | Make `harness.abort()` awaitable before `switchThread` | V2-H12 / V2-M12 | FEATURE_SPEC |
| UC-RUN-05 | `disposeRuntime` fires SessionEnd + `harness.destroy()` + idle-TTL eviction | V2-H8 | FEATURE_SPEC |
| UC-RUN-06 | Per-session ownership middleware on `protectedProcedure` | V2-H11 | CONSTITUTION |
| UC-RUN-07 | Restore session title generation | V2-H9 (feature regression) | FEATURE_SPEC |
| UC-RUN-08 | Refresh OAuth credentials during long-running sessions | V2-M11 | FEATURE_SPEC |

---

## UC-RUN-01: Scope model-provider credentials per `createMastraCode` invocation

**Description**: Eliminate the multi-tenant `process.env` mutation race (V2-H3) by passing resolved Anthropic/OpenAI credentials directly into `createMastraCode` options (or a per-call subprocess with scoped env) instead of mutating shared host-process env vars at `runtime-env.ts:12-19` and `LocalModelProvider.prepareRuntimeEnv:60-66`. CRITICAL — multi-tenant credential blast radius.

**Acceptance Criteria**:
- ☐ The host-service operator can run two `chat.sendMessage` calls concurrently against two different workspaces and observe each call only sees its own credentials (verified by a test credential resolver that returns workspace-tagged tokens and a Mastra mock that echoes the token it received).
- ☐ The CI grep gate fails any future PR that introduces `process.env[...] =` or `delete process.env[...]` inside `packages/host-service/src/providers/`.
- ☐ The `ModelProviderRuntimeResolver` interface no longer exposes `prepareRuntimeEnv(): Promise<void>` (no-arg side-effecting). It exposes `resolveCredentialsFor(sessionContext): Promise<ResolvedCredentials>` returning a value object.
- ☐ `ChatRuntimeManager.createRuntime` (`chat.ts:464`) no longer calls `prepareRuntimeEnv()`; it calls `resolveCredentialsFor({ sessionId, workspaceId })` and forwards the returned credentials into `createMastraCode` options.
- ☐ A unit test verifies that aborting Session A mid-resolve does NOT affect the credentials Session B receives (no shared mutable state).
- ☐ When `mastracode` does not yet support per-invocation credentials, the implementer documents the blocker in the task file and the workaround (subprocess-per-call, or per-process env namespacing) is exercised in tests against the real `createMastraCode`.

---

## UC-RUN-02: Resolve the `abort` no-op stub: commit to `stop`-only contract

**Description**: Address the Category-3 stub at `useWorkspaceChatDisplay.ts:289` (`abort: async () => undefined`). The renderer-planner owns the file but the host-service owns the contract: this UC commits the host-service to a `stop`-only cancellation contract that is awaitable and observable, and signals the renderer to delete the `abort` field from `UseChatDisplayReturn`. Addresses V2-H1.

**Acceptance Criteria**:
- ☐ The host-service tRPC chat router exposes exactly one cancellation procedure (`stop`) with a documented contract: "awaitable; returns after `harness.abort()` settles and the `agent_end` event has fired, or 5s timeout elapses."
- ☐ The contract is documented in `packages/host-service/src/runtime/chat/CONTRACT.md` and referenced from the tRPC router JSDoc.
- ☐ An integration test against a real `createMastraCode` runtime starts a long-running `sendMessage`, calls `stop`, awaits resolution, then asserts `getSnapshot().displayState.isRunning === false` within 5 seconds.
- ☐ The renderer-side `abort` field is deleted from `UseChatDisplayReturn` (paired with the renderer change in V2UI). TypeScript surfaces all callers; each is migrated to `stop` or deleted.
- ☐ No function in the v2 chat surface (renderer, electron, host-service) has a name like `abort` whose body is empty or returns `undefined` unconditionally.

---

## UC-RUN-03: Resolve `getMcpOverview` stub: remove or implement

**Description**: `ChatRuntimeManager.getMcpOverview` at `chat.ts:793-798` returns `{ sourcePath: null, servers: never[] }`. MCP is currently disabled (`disableMcp: true` at `chat.ts:468`). Decide: (a) remove the endpoint + renderer's MCP UI gates on its absence, or (b) re-enable MCP and implement real introspection with a discriminated union. Recommend (a) for v2 GA; (b) is a separate MCP-rework PRD. Addresses V2-H2.

**Acceptance Criteria**:
- ☐ A decision is recorded in `packages/host-service/docs/mcp-decision.md` selecting (a) remove or (b) implement, with rationale.
- ☐ If (a): the `getMcpOverview` procedure is deleted from `packages/host-service/src/trpc/router/chat/chat.ts:165-169` AND `ChatRuntimeManager.getMcpOverview` is deleted from `chat.ts:793-798`. The renderer-planner is notified to remove the `useMcpUi` consumer. No `never[]` return type remains in production code.
- ☐ If (b): `ChatRuntimeManager.getMcpOverview` returns a discriminated union — `{ kind: 'enabled', sourcePath: string, servers: Array<{ name, transport, status: 'connected'|'disconnected'|'error', toolCount: number }> }` OR `{ kind: 'disabled', reason: string }`. Real introspection delegates to `runtime.mcpManager.listServers()` or the equivalent `mastracode` API.
- ☐ If (b): an integration test creates a real runtime with `disableMcp: false` and at least one mock MCP server, then asserts `getMcpOverview` returns `kind: 'enabled'` with the expected server entry.
- ☐ A reviewer can grep the host-service package for `never[]` and find zero hits in production code.

---

## UC-RUN-04: Make `harness.abort()` awaitable before `switchThread` in `restartFromMessage`

**Description**: `restartRuntimeFromUserMessage` at `chat.ts:344-346` fires `runtime.harness.abort()` (synchronous) then `await runtime.harness.switchThread(...)`. Under mastracode's internal scheduling, the abort may not settle before the new thread is selected, leaving the new thread cancelable by an in-flight abort. Addresses V2-H12 / V2-M12.

**Acceptance Criteria**:
- ☐ `restartRuntimeFromUserMessage` awaits abort completion before calling `switchThread`. If `mastracode` exposes `await harness.abort()` or `await harness.waitForIdle()`, use it; otherwise the task documents the missing primitive and adds a polling guard (read `harness.getDisplayState().isRunning` until false or 2s elapse).
- ☐ An integration test calls `restartFromMessage` while a long-running turn is active, then asserts the cloned thread's first `sendMessage` is NOT cancelled by the prior abort (`agent_start` fires for the cloned-thread send AFTER the abort settled).
- ☐ The test fails today (no await) and passes after the fix — demonstrated by running the test once before changes.

---

## UC-RUN-05: `disposeRuntime` fires SessionEnd + `harness.destroy()` + idle-TTL eviction

**Description**: `disposeRuntime` at `chat.ts:537-572` calls `harness.abort()` and `mcpManager.disconnect()` but skips `hookManager.runSessionEnd()` and `harness.destroy?.()`. The harness subscription at `chat.ts:385` holds a reference to `runtime` and is never released. Also no idle eviction → `runtimes` map grows unbounded. Addresses V2-H8 + the unbounded-map concern.

**Acceptance Criteria**:
- ☐ `disposeRuntime` calls `await runtime.hookManager?.runSessionEnd().catch((err) => console.warn(...))` BEFORE deleting from `runtimes`.
- ☐ `disposeRuntime` calls `await runtime.harness.destroy?.().catch((err) => console.warn(...))` BEFORE deleting from `runtimes`.
- ☐ The harness subscription registered in `subscribeToSessionEvents` is explicitly unsubscribed via the unsubscribe handle returned by `harness.subscribe` (refactor to capture and call the handle during dispose).
- ☐ A new `IdleRuntimeSweep` (or method on `ChatRuntimeManager`) runs every 60 seconds, calls `disposeRuntime` for any `RuntimeSession` whose `lastAccessedAt > 2h` ago. `lastAccessedAt` is updated on every `getOrCreateRuntime` cache hit.
- ☐ A `.claude/settings.json` SessionEnd hook fixture is exercised in an integration test that creates a session, calls `endSession`, and verifies the hook ran (assert side effect — e.g., the hook writes a marker file).
- ☐ A unit test verifies idle-TTL: fake-timer advances 2 hours, the sweep runs, `disposeRuntime` is called for the stale session, and the runtime is removed from `this.runtimes`.

---

## UC-RUN-06: Per-session ownership middleware on `protectedProcedure`

**Description**: `getOrCreateRuntime(sessionId, workspaceId)` matches sessionId↔workspaceId binding but never verifies the **caller** (renderer window) owns the workspace. The PSK is shared per-org across all windows. Any compromised renderer in any window has full access to all sessions across all open workspaces. Addresses V2-H11 — pairs with the renderer-side HMAC claim issuance scoped under UC-HOST-04 (window-claim minting flows through the same Electron-main HMAC infrastructure).

**Acceptance Criteria**:
- ☐ `protectedProcedure` (in `packages/host-service/src/trpc/index.ts`) adds a middleware that asserts the resolved caller identity matches `input.workspaceId` for every chat procedure that takes `sessionInput` or `workspaceSlashInput`.
- ☐ The caller identity is plumbed from the `HostAuthProvider.validate` result — implementer threads the active workspace claim through (e.g., `HostAuthProvider` exposes `getActiveWorkspaceId(request)`).
- ☐ An integration test issues a PSK + window-claim authenticated request for workspaceId=W1 then calls `chat.sendMessage({ workspaceId: W2 })` — the middleware rejects with `FORBIDDEN`.
- ☐ Existing tests pass: a request whose claim matches the input workspaceId succeeds.
- ☐ The middleware's behavior is documented in `packages/host-service/src/trpc/CONTRACT.md` so the electron-planner team can coordinate the window-claim plumbing.
- ☐ Cross-window test: with two BrowserWindows each authenticated for the same org but different active workspaces, neither window can act on the other's sessions.

---

## UC-RUN-07: Restore session title generation

**Description**: v2 never calls `api.chat.updateTitle.mutate`. v1's `generateAndSetTitle` (referenced from `packages/chat/src/server/trpc/utils/runtime/runtime.ts:466-537`) fired after every send. Sessions stay "New Chat" forever in v2 — feature regression. Decide ownership (host-service vs cloud), then implement. Addresses V2-H9.

**Acceptance Criteria**:
- ☐ A decision is recorded in `packages/host-service/docs/title-generation-decision.md` selecting host-service ownership OR cloud ownership.
- ☐ If host-service ownership: `ChatRuntimeManager.sendMessage` (`chat.ts:676-698`) fires `void this.generateAndSetTitleAsync(input)` after `harness.sendMessage` returns, mirroring v1's pattern.
- ☐ If host-service ownership: `generateAndSetTitleAsync` calls `harness.listMessages()`, applies the "1st user message OR every 10th" gate (matching v1's `runtime.ts:498-500`), generates the title via the existing `generateTitleFromMessage`, and calls `ctx.api.chat.updateTitle.mutate({ sessionId, title })`.
- ☐ Failures are logged via `console.warn` and swallowed (v1 parity at `runtime.ts:534-536`); they MUST NOT block the user's turn.
- ☐ Concurrency: at most one in-flight title-generation call per session (tracked on `RuntimeSession`). If a second send arrives before the prior finishes, the prior is awaited then the new one is gated normally.
- ☐ An integration test sends one message, awaits the title-generation promise (exposed for testability), and asserts `api.chat.updateTitle.mutate` was called with a non-empty title.
- ☐ A user sending their first message in a fresh session sees the title update in the SessionSelector within 10 seconds.
- ☐ If cloud ownership: the cloud team's PRD covers the trigger path; this UC reduces to a removal of any stale host-service title-gen code paths and documentation of the cloud handoff in the contract file.

---

## UC-RUN-08: Refresh OAuth credentials during long-running sessions

**Description**: `resolveAnthropicCredential` (`packages/host-service/src/providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts:86-130`) handles refresh only when called fresh. `prepareRuntimeEnv` / `resolveCredentialsFor` runs once at session creation (`chat.ts:464`). Long sessions silently use expired tokens after the OAuth window elapses. Addresses V2-M11.

**Acceptance Criteria**:
- ☐ Credentials are re-resolved before every `harness.sendMessage` (and `restartFromMessage`, `respondToApproval`, `respondToQuestion`, `respondToPlan`) — NOT cached at session creation time only.
- ☐ When credential refresh fails after retry, the host-service emits a structured tRPC error: `UNAUTHORIZED` with `code: 'AUTH_REFRESH_FAILED'`, replacing today's silent `console.warn` swallow.
- ☐ The renderer-planner is informed (cross-layer dependency) to surface `AUTH_REFRESH_FAILED` in the UI as a re-auth prompt rather than a generic error.
- ☐ A unit test fakes the OAuth `expires` to a past timestamp and verifies the refresh path runs on the second send, not just at session creation.
- ☐ A second unit test verifies that when refresh fails (the underlying call throws), `console.warn` becomes `console.error` AND the tRPC procedure rejects with `AUTH_REFRESH_FAILED`.
- ☐ Refresh leverages the IPC handshake established in UC-HOST-09 (`creds.refresh` channel from Electron main).
