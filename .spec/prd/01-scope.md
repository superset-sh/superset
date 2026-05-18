---
stability: FEATURE_SPEC
last_validated: 2026-05-18
prd_version: 1.0.0
scope_posture: full
---

# Scope

## Scope Posture

**Full feature.** This PRD assumes a complete polish initiative — all v2-GA-blocking risks closed before the v2 chat surface is considered production-safe. `kb-prd-plan` no longer asks for sizing; if reality forces a cut, see Cut Order below.

## In Scope

### Renderer (V2UI group — 7 UCs)
- Replace text-equality optimistic user-message reconciliation with signature-based approach (V2-M2)
- Align `withoutActiveTurnAssistantHistory` filter with `getVisibleMessages` (V2-M3 — close the pending-question dedup gap)
- Make snapshot polling adaptive (4 fps active, ≤1 fps idle, stop on hidden) and drop `refetchIntervalInBackground` default (V2-H12)
- Surface `PendingQuestionMessage` submission errors inline with `select-text cursor-text` per `apps/desktop/AGENTS.md` (V2-M4)
- Evict `workspaceClientsCache` entries on provider unmount (V2-M1 — close the leak)
- Lift `useWorkspaceChatController` to a single shared instance shared by `ChatPane` and `ChatPaneTitle` (V2-M5)
- (Cross-layer half) Renderer-side cleanup that fires `commands.stop()` on unmount when `isRunning` (V2-H7 — paired with UC-HOST-09)

### Host-Service Lifecycle + IPC Security (HOST group — 10 UCs)
- Preload `ipcRenderer` channel allowlist (V2-H6 / v1 carry-over)
- Org-scoped authorization on `hostServiceCoordinator.{start, restart, reset, getConnection, getProcessStatus, onStatusChange}` (V2-H4)
- Introduce `protectedProcedure` and `orgScopedProcedure` middleware in desktop tRPC core
- Authenticate `notifications.hook` with HMAC + UUID validation on `terminalId` (V2-H5)
- Rotate PSK per spawn + encrypt manifest at rest via Electron `safeStorage` / OS Keychain (V2-M7)
- Move `ChatService` (OAuth loopback + auth storage) out of host-service into Electron main, plumb resolved credentials via IPC handshake (V2-H15)
- Extend `no-electron-coupling.test.ts` to walk transitive import graph (V2-H14)
- Pane-close drain coordination: Electron `before-quit` drains in-flight turns before SIGTERM (V2-H7 / V2-M8 — paired with V2UI cleanup)
- v1 stack deprecation decision: dated removal of `chatRuntimeService` + `chatService` OR formal dual-stack hardening (V2-GA-blocking decision)
- Document production CORS posture (`file://` origin omitted by Chromium; PSK is sole real auth) and gate `allowedOrigins` to dev (V2-M10)

### Mastra Runtime (RUN group — 8 UCs)
- Per-invocation credential scoping (eliminate `process.env` mutation in `runtime-env.ts`) (V2-H3 CRITICAL)
- Resolve the `abort: async () => undefined` stub: host-service commits to `stop`-only contract OR adds real `abort` (V2-H1)
- Resolve `getMcpOverview` stub: remove endpoint (and renderer's MCP UI) OR implement real introspection with discriminated union (V2-H2)
- Make `harness.abort()` awaitable before `switchThread` in `restartFromMessage` (V2-H12 / V2-M12)
- `disposeRuntime` fires SessionEnd hook, calls `harness.destroy()`, unsubscribes from harness events; add idle-TTL eviction (V2-H8 + unbounded map)
- Per-session ownership middleware on `protectedProcedure` (V2-H11 — paired with HOST window-claim issuance)
- Restore session title generation (decide host-service vs cloud ownership) (V2-H9 feature regression)
- Refresh OAuth credentials during long-running sessions (V2-M11) + surface `AUTH_REFRESH_FAILED` as a typed tRPC error

## Out of Scope

### Deferred to a separate PRD
- **Agent Observability & Guardrails (OBS group)** — Langfuse/equivalent trace observability, `CostGuardProcessor`, `PromptInjectionDetector`, golden eval datasets, CI eval gate, memory-model ADR. *[DEFERRED: separate PRD]* — this is greenfield infrastructure, deserves its own scope, CI gates, and review rubric. Should be the immediate follow-up.

### Deferred to follow-up polish PRD (lower severity)
- `useWorkspaceChatController` for shared hoisting — already in scope, but additional polish for shared state shape: *out of scope*
- Slash-command `staleTime: Infinity` (V2-L7)
- Auto-launch refs cleanup on unmount (V2-L8)
- Dead-API surface removal: `getDisplayState` and `listMessages` v2 procedures (V2-M14)
- `updateSession.mutate(...).catch(() => {})` silent failure → `console.warn` (V2-M13)
- Host-service test auth-bypass removal (V2-M16)
- `health.check` `publicProcedure` (V2-L1)
- `HarnessWithConfig as unknown as` casts (V2-L2)
- `safety.ts` exception swallowing (V2-L4)
- `workspaces` schema `kind` column verification (V2-L5)
- Duplicate `sendMessageMutation` handles (V2-L6)
- Tunnel JWT in URL (V2-M6) and tunnel header sanitization (V2-M15) — *should land in this PRD if the tunnel becomes production-active during this cycle; deferring assumes tunnel stays staging-only*
- Port allocation TOCTOU (V2-M9) — *deferred unless we observe port collisions in production*
- Host-service crash circuit breaker (V2-M8) — *partial coverage via pane-close drain UC; full breaker deferred*
- Session bootstrap two-phase commit (V2-H10) — *requires cloud-side coordination; defer until host-service crash-recovery UX is shaped*

### Out of scope entirely (not in any planned PRD)
- v1 ChatPane improvements / v1-specific bugs — v1 is in maintenance mode (or being deprecated; see UC-HOST-10)
- Cloud session record schema changes
- Mobile or web chat surfaces — desktop only
- New chat features (multi-pane sync, cross-session search, chat sharing) — this is polish, not feature work
- MCP re-enablement (related to UC-RUN-03 outcome) — if MCP is re-enabled, a dedicated MCP-rework PRD covers reconnect, health, tool refresh
- Replacing 4 fps polling with WebSocket subscription on snapshot diffs — opportunity flagged in red-hat, deferred to "v2 Chat Transport Modernization" follow-on
- React-DB migration / cross-pane state sync beyond UC-V2UI-06
- Cloud auth modernization beyond the host-side ChatService relocation (UC-HOST-09)

## Cut Order

If scope must shrink, cut in this order (preserve CRITICAL and stub-fix items):

1. **First cut**: Deferred polish (already out of scope above — keep deferred)
2. **Second cut** if needed: HOST-08 (production CORS posture documentation) — can be a doc-only follow-up
3. **Third cut**: V2UI-06 (controller hoist) — quality fix, not a correctness fix
4. **Fourth cut**: HOST-05 (PSK rotation + Keychain) — meaningful security improvement but the threat (shared home dir) is low-likelihood
5. **Fifth cut**: HOST-10 (v1 deprecation decision) — can defer to a separate planning doc

**Cannot cut**:
- Both stub fixes (UC-RUN-02 abort, UC-RUN-03 getMcpOverview) — SUPREME RULE violation if shipped as-is
- UC-RUN-01 per-invocation credentials — CRITICAL multi-tenant blast radius
- UC-HOST-01 preload allowlist — CRITICAL IPC escalation path
- UC-HOST-02/03 coordinator authz + middleware infra — CRITICAL DoS path
- UC-HOST-04 notifications.hook auth — CRITICAL relay-reachable enumeration
- UC-HOST-09 ChatService extraction — load-bearing for UC-RUN-01 and UC-HOST-07
- UC-RUN-05 disposeRuntime cleanup — load-bearing for memory bounds and SessionEnd hook semantics
- UC-V2UI-07 + UC-HOST-08 pane-close drain — agent-keeps-editing-after-close is a trust-breaking bug
