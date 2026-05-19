---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-18
prd_version: 1.1.0
---

# v2 Internal Chat Polish

## Product description

The v2 internal chat agent is Superset's next-generation chat surface, replacing the legacy v1 stack that runs the Mastra runtime inside the Electron main process. v2 architecture:

- **Renderer** — forked v2 ChatPane tree under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/`
- **Transport** — `@superset/workspace-client` over HTTP, *not* `trpc-electron` IPC
- **Runtime** — `@superset/host-service`, a Bun HTTP server spawned as a detached child process from Electron main and supervised via `host-service-coordinator`
- **Tunnel** — optional WebSocket relay for remote-workspace access

This PRD polishes the v2 surface to address risks identified by the 2026-05-18 red-hat review across all three layers.

## Problem statement

The v2 cut-over is functionally usable but **not production-safe**. Independent reviewers across three specialist domains (React+Vite renderer, Electron non-renderer dataflow, Mastra runtime) converged on a consistent picture:

1. **Two Category-3 stubs ship in v2 today**:
   - `abort: async () => undefined` (`useWorkspaceChatDisplay.ts:289`) — a named no-op exposed on the public commands API
   - `getMcpOverview` returns hardcoded `{ sourcePath: null, servers: never[] }` (`packages/host-service/src/runtime/chat/chat.ts:793-798`) — the `never[]` return type is the implementer flagging their own stub
   These violate the SUPREME RULE against stubbed core logic.

2. **Multi-tenant credential blast radius** — the v1 `process.env` mutation TOCTOU race (previously bounded by single-active-chat-in-Electron-main) is now *worse* in v2: the host-service is a long-running Bun process serving multiple workspaces and concurrent sessions on shared global `process.env`, with no mutex. Session A's Anthropic key can authenticate Session B's mid-flight turn.

3. **Open authorization surface** — three `publicProcedure` endpoints with no caller-org or caller-session validation:
   - `hostServiceCoordinator.restart`/`reset` — any compromised renderer can SIGKILL any org's host-service
   - `notifications.hook` — terminal-ID enumeration oracle + cross-workspace event injection, reachable through the relay
   - v2 host-service `chat.*` procedures — any window can act on any session within the same org (PSK is per-org, not per-window)

4. **Preload IPC allowlist still absent** — the renderer's `window.ipcRenderer` relay forwards any channel string to main; XSS/compromised renderer code can reach the SQLite persistence channel and any other `ipcMain` handler. Inherited from v1.

5. **Architectural invariant silently violated** — `no-electron-coupling.test.ts` passes green while `packages/host-service/src/runtime/chat/chat.ts:8` imports `@superset/chat/server/desktop` which transitively pulls `ChatService` (OAuth loopback HTTP servers — UI-process code) into the headless Bun runtime.

6. **Feature regression vs v1** — v2 silently dropped session title generation. v1's `generateAndSetTitle` fired on every send; v2 sessions stay "New Chat" forever.

7. **Lifecycle gaps** — pane unmount during an active turn orphans the host-service runtime (the agent keeps editing files after the user closed the tab). `disposeRuntime` does not run SessionEnd hooks or call `harness.destroy()`. No idle-TTL eviction on the session map.

8. **Performance/UX issues** — text-equality optimistic-message reconciliation flashes/ghosts on duplicate sends and on workspace switches; active-turn dedup filters diverge between the hook and the message-list helpers; polling is 4 fps with `refetchIntervalInBackground: true` regardless of idle state. Post-PRD analysis of the two reported duplicate-message reports (one assistant, one user) confirmed the specific mechanisms — a one-frame composition race in the user-message useMemo, and the missing `stopReason + id !== currentMessage.id` guards on the assistant filter — captured as refined ACs on UC-V2UI-01 and UC-V2UI-02 plus new UCs UC-V2UI-08..12 for adjacent UI/UX polish.

## Solution summary

This PRD closes the v2-GA-blocking subset of the red-hat findings across three coordinated functional groups:

- **V2UI** (renderer polish) — fix optimistic-message reconciliation, align active-turn filters, adaptive polling, selectable error UI, cache eviction.
- **HOST** (host-service lifecycle + IPC security) — preload allowlist, org-scoped authorization middleware, notifications.hook auth, PSK rotation + Keychain seal, ChatService extraction to Electron main, no-electron-coupling import-graph enforcement, v1 deprecation decision.
- **RUN** (Mastra runtime polish) — per-invocation credentials (no more `process.env` mutation), abort/stop contract, getMcpOverview decision (remove or implement), abort-awaitable-before-switchThread, disposeRuntime cleanup, per-session ownership middleware, title generation restoration, OAuth refresh during long sessions.

The OBS group (greenfield observability, evals, prompt-injection detector, cost guard) is **deferred to a separate PRD** because it is greenfield infrastructure rather than polish of existing surfaces, and deserves its own scope, CI gates, and review rubric.

## v1 → v2 context

v1 (`packages/chat/src/server/trpc/service.ts` + `apps/desktop/src/lib/trpc/routers/chat-runtime-service/`) is **still registered and active** in the Electron AppRouter (`apps/desktop/src/lib/trpc/routers/index.ts:35-36`). v2 is opt-in. This PRD includes one UC (UC-HOST-10) to force a decision: deprecate v1 on a dated milestone, or formally commit to dual-stack and apply hardening to both surfaces. The blast radius of preload allowlist (UC-HOST-01) and ChatService extraction (UC-HOST-09) changes meaningfully depending on this decision.
