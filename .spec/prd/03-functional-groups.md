---
stability: FEATURE_SPEC
last_validated: 2026-05-18
prd_version: 1.0.0
---

# Functional Groups

| Name | Prefix | Owner | Description |
|------|--------|-------|-------------|
| V2 Renderer Polish | `V2UI` | react-vite-planner | Tightens the v2 ChatPane renderer surface: optimistic/snapshot reconciliation, active-turn filter alignment, adaptive polling, error UX, memory/runtime leaks across pane lifecycle. Mostly FEATURE_SPEC. |
| Host-Service Lifecycle & IPC Security | `HOST` | electron-planner | Locks down the desktop-side dataflow for v2 chat: preload IPC allowlist, coordinator authorization middleware, manifest secret-storage, OAuth-flow boundary (`ChatService` relocation), relay tunnel hardening, architectural invariant enforcement, v1 deprecation decision. Mix of CONSTITUTION (security infra) and FEATURE_SPEC (operational behavior). |
| v2 Mastra Runtime Polish | `RUN` | mastra-planner | Resolves the two confirmed Category-3 stubs (abort, getMcpOverview), the multi-tenant `process.env` credential race, the abort-then-switchThread race, the missing `disposeRuntime` cleanup, the silent title-generation regression, and adds per-session ownership middleware + OAuth refresh during long sessions. Mix of CONSTITUTION (credential scoping, ownership middleware) and FEATURE_SPEC (observable behavior). |

## Use Case Summary

| Group | Prefix | UCs |
|-------|--------|-----|
| V2 Renderer Polish | V2UI | 7 |
| Host-Service Lifecycle & IPC Security | HOST | 10 |
| v2 Mastra Runtime Polish | RUN | 8 |
| **Total** | | **25** |

## Cross-Layer Use Cases

These UCs require coordinated implementation across two or three layers. They are owned in one group but referenced from the others.

| UC | Owning Group | Coordinating Groups | What spans layers |
|---|---|---|---|
| Abort/stop contract resolution | RUN (UC-RUN-02) | V2UI (drop `abort` from `UseChatDisplayReturn`) | Renderer removes the no-op; host-service guarantees `stop` is awaitable. |
| Pane-close drain | V2UI (UC-V2UI-07) + HOST (UC-HOST-08) | RUN (UC-RUN-05 enables clean teardown) | Renderer fires `commands.stop()` on unmount when running; Electron `before-quit` drains via coordinator; host-service runs SessionEnd + harness.destroy(). |
| Per-session ownership | RUN (UC-RUN-06) | HOST (UC-HOST-04 issues window claim header) | Renderer attaches per-window HMAC claim; Electron main mints it; host-service middleware validates it against requested `workspaceId`. |
| ChatService relocation | HOST (UC-HOST-09) | RUN (drops ChatService instantiation; consumes resolved credentials via IPC handshake) | OAuth loopback owned by Electron main; host-service receives credentials at spawn + via `creds.refresh` channel. |
| `no-electron-coupling` enforcement | HOST (UC-HOST-07) | RUN (extracts pure slash-command helpers out of `@superset/chat/server/desktop`) | Build-time check walks import graph and fails on transitive Electron reach; helper package extraction unblocks it. |

## Stability Layer Assignments (per UC)

| Stability | UCs |
|-----------|-----|
| **CONSTITUTION** (security/architecture invariants) | UC-HOST-01, UC-HOST-02, UC-HOST-03, UC-HOST-04, UC-HOST-05, UC-HOST-07, UC-HOST-09, UC-RUN-01, UC-RUN-06 |
| **FEATURE_SPEC** (observable behavior covered by AC tests) | UC-V2UI-01 through UC-V2UI-07, UC-HOST-06, UC-HOST-08, UC-HOST-10, UC-RUN-02, UC-RUN-03, UC-RUN-04, UC-RUN-05, UC-RUN-07, UC-RUN-08 |

`PRODUCT_CONTEXT`-layer artifacts (overview, roles) are in `00-overview.md` and `02-roles.md`.
