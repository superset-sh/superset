# V1 → V2 Fast Migration Plan

A pragmatic plan to ship v1's chat UX on top of the v2 host-service architecture as quickly as possible. **Not** the full event-log rearchitect (see `v2-chat-greenfield-architecture.md` for that). This is the minimum change to "route everything through host-service" while keeping v1's client code, UI, and feature parity intact.

## TL;DR

- **Keep** all v1 client code: `ChatPane`, `ChatPaneInterface`, `useChatPaneController`, `useChatDisplay`, composer, approval/question dialogs, model picker, MCP UI.
- **Move** `ChatRuntimeService` (Mastracode harness host) from `packages/chat/src/server/trpc/` to `packages/host-service/src/runtime/chat/`.
- **Implement** the host-service chat-router stubs that already exist at `packages/host-service/src/trpc/router/chat/chat.ts`.
- **Collapse** the dual-poll race with a single fix: replace `getDisplayState()` + `listMessages()` with one `getChatSnapshot()` query that returns both, observed atomically on the server.
- **Repoint** the client's `chatRuntimeServiceTrpc` at host-service instead of Electron main.
- **Ship behind a per-workspace flag** so we can bake for a week without risking existing users.

Scope: ~1-2 weeks of work, one engineer. No new schemas, no event log, no reducer rewrite, no new vendors, no wire-format changes.

## Goals

1. **Host-service becomes the single owner of chat runtime** — matches the direction of travel from `host-service-chat-architecture.md` without doing the full greenfield rearchitect.
2. **Kill the dual-poll race** with the smallest possible fix. One query instead of two.
3. **Preserve v1 feature parity exactly.** No UX regressions, no new bugs.
4. **Ship to users in 1-2 weeks**, behind a flag, with a clean rollback path.
5. **Don't block the greenfield work.** This migration should land the host-service ownership move so the greenfield plan's P0-P4 can build on top of it without a second migration.

## Non-goals

- **Not** rewriting the client reducer, store, or `useChatDisplay`.
- **Not** introducing an event log, sequence numbers, gap detection, or a durable store.
- **Not** changing the wire protocol beyond collapsing two queries into one.
- **Not** adding multi-device support. Each session is still owned by one local host-service, reachable by one client.
- **Not** touching the v2-workspace route (`/routes/.../v2-workspace/`). That route stays where it is; its drift with v1 (per `v2-workspace-chat-drift-audit.md`) is a separate closeout.
- **Not** solving provider credential scoping end-to-end — enough to run, not enough to be elegant.

## The one real race fix

V1's dual-poll race is the single highest-value thing to address, and it doesn't need the greenfield architecture to fix. The problem:

```ts
// packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts (today)
const displayQuery  = chatRuntimeServiceTrpc.session.getDisplayState.useQuery(...)   // 4 fps
const messagesQuery = chatRuntimeServiceTrpc.session.listMessages.useQuery(...)       // 4 fps
```

Two independent refetches at 250 ms can observe the server at different moments, so the message list and the "currently running?" flag can be momentarily inconsistent. Every mitigation today (`withoutActiveTurnAssistantHistory`, optimistic-message reconciliation) is a workaround for this single root cause.

The fix is trivial: **one procedure returns both, atomically observed on the server.**

```ts
// new on host-service
chat.session.getSnapshot(input) -> {
  displayState: { isRunning, currentMessage, errorMessage, pendingApproval, pendingQuestion, ... },
  messages:     Message[],
  observedAt:   number,   // server-side monotonic counter or clock
}
```

Server-side implementation reads both from the same in-memory `RuntimeSession` in one synchronous block; both come from the same observation. Client polls `getSnapshot` at the same 4 fps cadence. No event log needed; just no-more-two-queries.

Between-polls race is unavoidable (that's what polling is), but the *between-two-concurrent-polls* race disappears entirely. And `withoutActiveTurnAssistantHistory` becomes accurate because the filter now runs against a consistent snapshot.

This is the single change that most reduces bug reports without any architectural work.

## What moves where

### Server-side

| Piece | Current location | New location | Notes |
|---|---|---|---|
| `ChatRuntimeService` (session Map + Mastracode harness) | `packages/chat/src/server/trpc/service.ts` | `packages/host-service/src/runtime/chat/chat-runtime-service.ts` | Essentially copy-paste + adapt DI for host-service Layer pattern |
| tRPC chat router (procedures) | `apps/desktop/src/lib/trpc/routers/chat-runtime-service/index.ts` (Electron IPC wrapper) | `packages/host-service/src/trpc/router/chat/chat.ts` (stubs already exist) | Implement the stubs; IPC wrapper can stay as a thin forwarder for P0 bake period |
| `chat-service` procedures (auth, slash commands, MCP, file search) | `apps/desktop/src/lib/trpc/routers/chat-service/index.ts` | `packages/host-service/src/trpc/router/chat/` | Some parts must stay in Electron main (OS keychain access for auth); rest moves |
| Session metadata create/delete | `/api/chat/[sessionId]` REST routes | `chat.session.create` / `chat.session.delete` tRPC on host-service | Frees us from the REST round-trip for bootstrap |
| Provider credential handling | Electron main | Host-service — **unresolved** | See Open Questions |

### Client-side

| Piece | Change |
|---|---|
| `ChatPane.tsx`, `ChatPaneInterface`, `useChatPaneController`, composer, approvals, model picker, MCP UI | **No change** beyond the tRPC client pointing at a different surface |
| `useChatDisplay` | One small change: swap `getDisplayState` + `listMessages` queries for a single `getSnapshot` query; `messages`, `isRunning`, `currentMessage` become selectors over the unified snapshot |
| `chatRuntimeServiceTrpc` (tRPC client) | Swap transport from Electron IPC to the host-service tRPC client — probably via a dynamic resolver that picks the right link based on the per-workspace flag |
| Session bootstrap | `useChatPaneController` today calls REST `/api/chat/[sessionId]`; change to call host-service tRPC `chat.session.create`/`delete` |
| Feature flag | Add `chat.useHostService` (default off) that switches the tRPC client target |

## Phased migration

Phases are tight. Each should be a separate PR.

### Blockers (resolve before P0)

- [ ] **Provider credential scoping for host-service.** Host-service needs to read Anthropic credentials (and any others) that currently live in Electron's secure storage. Options: (a) Electron main exposes a tRPC procedure host-service can call to fetch creds, (b) host-service gets its own keychain integration, (c) creds are passed at session-start time via an already-unlocked channel. Recommend (a) for speed — it's an existing pattern and keeps keychain access in Electron main where it belongs. Resolve before P0.
- [ ] **Decide flag shape.** Per-workspace flag (`workspace.chat.useHostService`) or per-user flag (`user.flags.chatViaHostService`)? Recommend per-workspace — lets us canary specific test workspaces first, and matches how the workspace is the natural chat scoping unit.

### P0 — Move runtime service into host-service (server-side only)

**Goal:** the full `ChatRuntimeService` lives in host-service, exposed via the existing tRPC stubs. Old Electron-IPC chat router stays alive untouched; nothing visible to users yet.

- [ ] Copy `packages/chat/src/server/trpc/service.ts` into `packages/host-service/src/runtime/chat/chat-runtime-service.ts`. Adapt imports + DI.
- [ ] Wire it into the host-service runtime registry (`packages/host-service/src/app.ts` — `runtime.chat` already exists as `ChatRuntimeManager`; this fleshes it out).
- [ ] Implement the existing tRPC stubs in `packages/host-service/src/trpc/router/chat/chat.ts`:
  - [ ] `getDisplayState` (temporary; delete in P1).
  - [ ] `listMessages` (temporary; delete in P1).
  - [ ] `sendMessage`, `stop`, `respondToApproval`, `respondToQuestion`, `respondToPlan`.
  - [ ] `getSlashCommands`, `resolveSlashCommand`, `previewSlashCommand`.
  - [ ] `getMcpOverview`.
  - [ ] `createSession`, `deleteSession`, `listSessions` (replacing the `/api/chat/[sessionId]` REST endpoints).
- [ ] Implement a provider-credentials bridge per the Blocker decision (tRPC procedure from host-service → Electron main, or equivalent).
- [ ] Unit/integration tests: host-service's chat router passes the same test matrix that the Electron-IPC chat router passes today.

**Acceptance:** host-service can run a full chat session end-to-end in isolation (no renderer), including approvals and slash commands. No client changes yet.

### P1 — Collapse dual-poll into `getSnapshot` (server + client)

**Goal:** one query per poll cycle.

- [ ] Add `chat.session.getSnapshot` procedure to the host-service chat router. Returns `{ displayState, messages, observedAt }` from a single synchronous read.
- [ ] Add the same procedure to the Electron-IPC chat router (so v1 users on the old path also get the fix) — implemented as a thin wrapper that calls the existing two methods back-to-back inside one handler invocation. Not as atomic as host-service's version (harness state can change between the two calls even inside one handler), but still reduces the race window from ~250 ms to a single handler tick.
- [ ] Update `useChatDisplay` to use `getSnapshot` instead of two queries. Derive existing return shape (`messages`, `isRunning`, etc.) as selectors over the snapshot.
- [ ] Keep `getDisplayState` and `listMessages` on both surfaces for now (P4 deletes them).
- [ ] Regression test: all existing chat scenarios behave identically; flaky intermittent mismatches in the optimistic-message tests should stop.

**Acceptance:** `useChatDisplay` uses one query; dual-poll race window is closed; no UX regression.

### P2 — Add per-workspace flag + client tRPC switch

**Goal:** the client can route chat traffic to either Electron main OR host-service based on a flag, for the *same UX*.

- [ ] Add `workspace.chat.useHostService` flag (per-workspace boolean). Stored wherever other workspace flags live.
- [ ] In the client, build a resolver that picks the right tRPC client (Electron-IPC vs host-service) based on the flag for the currently-active workspace.
- [ ] Ensure `useChatDisplay`, `useChatPaneController`, and every other chat consumer goes through the resolver instead of hardcoding the import.
- [ ] Flag defaults to off. Add a debug toggle in developer settings.
- [ ] Add a small banner (dev-only) indicating which backend is active per-workspace, to aid QA.

**Acceptance:** flipping the flag in dev switches the backend with no user-visible change except that the new backend is now being hit.

### P3 — Port session bootstrap off REST

**Goal:** `useChatPaneController` no longer talks to `/api/chat/[sessionId]` REST routes; instead uses host-service (or Electron-IPC, depending on flag) tRPC.

- [ ] Implement `chat.session.create` / `chat.session.delete` / `chat.session.get` / `chat.session.list` on both chat routers (Electron and host-service) with the same semantics as the current REST surface.
- [ ] Update `useChatPaneController` to call tRPC instead of `fetch('/api/chat/...')`.
- [ ] Keep REST routes alive for one release as a fallback; add a deprecation log when hit.
- [ ] Verify launch configs, session-init retry logic (`createSessionInitRunner`), and toasts still work.

**Acceptance:** chat session create/delete works identically whether the flag is on or off. REST routes see zero traffic from fresh clients.

### P4 — Turn the flag on for canary workspaces, then general availability

**Goal:** ship to users.

- [ ] Internal dogfood: flip the flag on for every developer workspace. Bake for a few days.
- [ ] Canary workspaces: flip on for 5-10% of real workspaces. Monitor Sentry and session telemetry for a week.
- [ ] General availability: flip the default to on for all new workspaces.
- [ ] Existing workspaces: migrate in a batched job or flip-all-at-once, whichever fits the ops risk tolerance.
- [ ] Keep an emergency rollback path (flip the flag off) available for two releases.

**Acceptance:** >95% of chat traffic lands on host-service; no spike in chat error rate; rollback script tested.

### P5 — Delete legacy paths

**Goal:** one code path.

- [ ] Delete Electron-main `chatRuntimeServiceTrpc` router and its IPC wrapper.
- [ ] Delete `/api/chat/[sessionId]` REST routes.
- [ ] Delete `packages/chat/src/server/trpc/service.ts` (host-service is the only owner now).
- [ ] Remove the per-workspace flag and the tRPC client resolver. Host-service becomes the only target.
- [ ] Delete `getDisplayState` and `listMessages` procedures everywhere (now that nothing calls them).
- [ ] Clean up `withoutActiveTurnAssistantHistory` if it's no longer needed in the snapshot world.
- [ ] Update `AGENTS.md` / relevant docs to point at the new surface.

**Acceptance:** zero references to the deleted surface in `apps/` or `packages/` (excluding `temp/`). CI green.

## How this relates to the greenfield plan

This migration lands the **host-service ownership move** that `v2-chat-greenfield-architecture.md` lists as a prerequisite for its P0. After this plan ships:

- `v2-chat-greenfield-architecture.md` P0 (define `ChatEvent` + `EventLog` + `EventBridge`) can build directly on top of the host-service chat-runtime-service.
- The `getSnapshot` procedure becomes deletable once the event-log subscription replaces it — the greenfield plan's P3 already includes this.
- No work here is thrown away; P4 of the greenfield plan deletes the two polling surfaces (`getSnapshot`, old dual queries) as part of its "delete the old surface" pass.

So this plan is not an alternative to the greenfield plan — it's the thing that unblocks it while giving users a better chat experience in the meantime.

## Summary timeline

Rough sizing for one engineer:

| Phase | Est. | Ships to users? |
|---|---|---|
| Blockers | 1-2 days | n/a |
| P0 (server move) | 3-5 days | no (no client change) |
| P1 (`getSnapshot`) | 2-3 days | yes (on both backends) |
| P2 (flag + resolver) | 2-3 days | no (off by default) |
| P3 (bootstrap off REST) | 2-3 days | no |
| P4 (canary → GA) | 1 week bake + flip | **yes** |
| P5 (delete legacy) | 2-3 days | n/a |

Total: ~2-3 weeks wall-clock including bake time. P4's bake window is the main gate; everything else can move as fast as review throughput allows.

## Open questions

- **Provider credentials.** The unresolved one from `host-service-chat-architecture.md`. Needs to be solved before P0, but the answer can be tactical ("Electron main exposes a creds-read tRPC procedure that host-service calls") rather than architectural. Defer the clean solution to the greenfield plan.
- **MCP auth flow.** Currently in Electron main (OS-native OAuth flows). Simplest path: leave MCP auth in Electron main, have host-service read resolved tokens via the same creds bridge. Full MCP-in-host-service move is out of scope here.
- **Workspace ensure + launch configs.** V1's `useChatPaneController` calls `apiTrpcClient.workspace.ensure`. That tRPC call can stay as-is; it's orthogonal to which chat backend is serving.
- **What happens to the v2-workspace route?** Unaffected by this plan. It continues to exist with its current drift from v1. Separate closeout tracked in `v2-workspace-chat-drift-audit.md`.
- **Session persistence on host-service restart.** Today, v1's in-memory `Map<sessionId, RuntimeSession>` is lost on Electron restart; same will be true on host-service restart. Not solved here; greenfield plan's event log is the real answer.

## Summary

Take v1's UI untouched. Copy `ChatRuntimeService` into host-service and implement the router stubs that are already there. Replace two queries with one atomic `getSnapshot` — that one change kills the dual-poll race without any architectural work. Gate behind a per-workspace flag, canary, flip on. Delete the old Electron-IPC router and REST bootstrap. ~2-3 weeks to ship, no new primitives, no new vendors, and the result is a clean host-service-owned chat that the greenfield plan's event-log work can then build on top of without re-doing any of this.
