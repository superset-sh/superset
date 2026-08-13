# ACP client layer: unify on @superset/workspace-client

Porting mobile chat to ACP surfaced that the day-old `packages/host-client` rebuilt a
slice of infrastructure the repo already has. Proposal: delete it and make
`@superset/workspace-client` the one client package for reaching hosts, on mobile too.

## What exists

**`@superset/workspace-client`** is the established, desktop-linked host client:

- `workspaceTrpc = createTRPCReact<AppRouter>()` — full router-type inference.
- `WorkspaceClientProvider({ cacheKey, hostUrl, headers, wsToken })` — caches a
  **QueryClient + trpcClient pair per `cacheKey:hostUrl`**, so each workspace/host
  subtree has an isolated react-query cache. This is the solved answer to multi-host
  cache-key collisions.
- `useWorkspaceWsUrl(path, params)` — WS URL minting with token query param (terminals
  already stream through it).
- Desktop mounts it per workspace: `WorkspaceProvider` →
  `WorkspaceTrpcProvider cacheKey={workspace.id} hostUrl headers wsToken`
  (`apps/desktop/.../v2-workspace/providers/WorkspaceProvider/WorkspaceProvider.tsx:42`).

**`packages/host-client`** (landed with ACP, mobile-only consumer) duplicates the
transport concern with a hand-rolled tRPC wire protocol (manual SuperJSON envelopes,
`?input=` GET encoding, error unwrapping — `transport.ts:54-111`), plus 401-refresh
retry and a WS URL factory. Mobile additionally has its own third stack
(`apps/mobile/lib/host-service/client.ts`, a vanilla `createTRPCClient<AppRouter>`)
for workspaces/git.

`packages/session-protocol` is a keeper: transport-agnostic contracts (envelope, state,
zod inputs), the pure `fold` reducer, `subscribeToSession`, and React hooks under
`./react`. React in shared packages is fine — every consumer is React; the core stays
pure only so bun tests (the ACP e2e suite) and future non-UI consumers can drive it.

## Proposal

1. **Delete `packages/host-client`.** Mobile is its only consumer.
2. **Mobile adopts `@superset/workspace-client`:**
   - Thread screen wraps in `WorkspaceClientProvider` (`cacheKey` = workspaceId,
     `hostUrl` = `buildRelayHostUrl(orgId, machineId)`, headers/wsToken from the auth
     client) — ACP calls become `workspaceTrpc.acpSessions.*` hooks with router
     inference; the live stream URL comes from `useWorkspaceWsUrl` +
     `subscribeToSession`.
   - Home screen is scoped to one selected host, so a single provider keyed by
     `machineId` covers the session list (`workspaceTrpc.acpSessions.list.useQuery`)
     and can progressively absorb `useHostWorkspaces`.
   - `useAcpSession`'s `api: AcpSessionsApi` parameter is structural — a thin adapter
     over the provider's `trpcClient` satisfies it; `session-protocol` unchanged.
3. **Extend `workspace-client` where mobile needs it** (benefits desktop-remote too):
   - Async `headers` + 401 → token refresh → retry-once (tRPC `retryLink` on
     UNAUTHORIZED). Today's sync header fn silently fails on JWT expiry — a latent bug
     for any relay consumer.
   - A non-React escape hatch (`createWorkspaceTrpcClient(hostUrl, headers)`) for
     imperative pre-navigation calls (create session → push route) and for the
     host-service e2e suite, which then exercises the production client stack.
4. **Keep the raw WebSocket stream.** Verified: the relay's HTTP tunnel buffers each
   response (`apps/relay/src/tunnel.ts`), so SSE/`httpSubscriptionLink` cannot stream
   through it — WS is the only relay-bridged streaming channel. The journal/seq resume
   contract and e2e suite stay. (Possible later: tRPC `wsLink` + `tracked()`, seq ↔
   lastEventId — parked in `plans/acp-session-follow-ups.md`.)
5. **Keep the 30s list poll** (same healing model as `workspace.list`); the per-session
   WS stream covers the open thread.

## Non-goals

- Desktop renderer chat (Electron IPC path) — untouched.
- `session-protocol` contract style (hand-written interfaces + shared zod) — unchanged;
  `workspaceTrpc` adds router inference on top where the app consumes procedures
  directly.

## Migration steps

1. `workspace-client`: async headers support + 401 retryLink + vanilla client factory.
   Check RN compatibility of the barrel (eventBus uses global WebSocket — RN has it).
2. Mobile: mount `WorkspaceClientProvider` in the thread + home screens; adapt
   `useAcpSession` inputs from the provider's `trpcClient` / `useWorkspaceWsUrl`.
3. Rewire `packages/host-service/test/integration/acp-host-client.e2e.test.ts` to the
   vanilla client factory.
4. Delete `packages/host-client`; fold `apps/mobile/lib/host/client.ts` down to relay
   URL + JWT helpers (or into the provider mount).
5. Follow-up (separate PR): migrate `useHostWorkspaces`/git/diff hooks off
   `lib/host-service/client.ts` onto the provider, then delete that third stack.
