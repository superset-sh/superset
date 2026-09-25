# Host presence served from the relay DO

## Problem

Host online status lives in `v2_hosts.is_online`, a DB cache of what the relay
already knows. The cache is written by one-shot events (`host.setOnline` on
connect/disconnect) and reconciled by a cron that only understands the v1
relay's Redis directory. During the 2026-08-11 incident it lied in both
directions: stale-`yes` for a vanished host (offline write blocked by an
expired token), stale-`no` for a live one (offline write raced a reconnect and
landed last). The relay2 liveness sweep now papers over this with a 45s
re-assert write per host — load that grows with fleet size and still only
converges eventually.

The `HostTunnel` Durable Object is the single authority: `idFromName(hostId)`
deterministically addresses the one object holding the host's live socket and
`lastHostSeenAt`. Presence should be a read against it, not a replicated flag.

## Detection model (unchanged)

Hosts ping every 30s over the control channel; the DO stamps `lastHostSeenAt`;
the liveness sweep closes any socket silent for 90s. "Online" = the DO holds an
open host socket. Maximum lie window ≈ one sweep interval.

## Design

### Relay (apps/relay2)

- DO RPC `presenceInfo(): { online: boolean; lastSeenAt: number | null }` —
  socket presence + stamp from storage; arms the liveness alarm lazily like
  `isConnected`.
- Worker `GET /presence?hostIds=<a,b,c>`: authenticate the JWT once, check
  access per host (LRU-cached `checkHostAccess`), fan out `presenceInfo` in
  parallel. Response: `{ hosts: { [hostId]: { online, lastSeenAt } } }`.
  Denied/unknown hosts are omitted, not errored — a partial answer is useful.
- Feature-detected by clients via the existing `/health` → `proto: 2` probe;
  the v1 relay never grows this endpoint.

### Server-side consumers (packages/trpc, apps/api)

- `host.list` enriches `online` from the relay when the user's resolved relay
  is proto-2 (forwarding the caller's bearer token), falling back to the DB
  value on error. This covers CLI, MCP, SDK, and the Slack agent with zero
  client changes.
- Automation dispatch drops its DB `isOnline` pre-gate in favor of
  presence-by-attempt: dispatch through the relay and map 503 to
  `skipped_offline`. Kills the TOCTOU between gate and dispatch. Fallback host
  selection queries `/presence` for the candidate set.
- `sync-presence` cron (`apps/api/.../hosts/jobs/sync-presence`): must stop
  flipping hosts it cannot see. Interim fix shipped independently of this
  plan: only reconcile hosts present in the v1 Redis TTL set. Deleted at
  cutover.

### Clients (desktop, mobile; web has no presence readers)

- One shared hook per surface, `useHostsPresence(machineIds)`: batch-poll
  `/presence` every 30s + on window focus via react-query. Relay URL and JWT
  come from the existing plumbing (`useRelayUrl` + `getJwt` on desktop,
  `getRelayUrl` + `getHostAuthToken` on mobile).
- Proto-gate: if the user's relay is not proto-2, the hook returns the
  Electric `v2Hosts.isOnline` values unchanged (customers on Fly keep today's
  behavior until cutover).
- Desktop readers migrate at their funnels: `useKnownHosts` (drives the
  sidebar icon chain), `useWorkspaceHostOptions` (device pickers + "Host is
  offline" gates), `useAccessibleV2Workspaces`, and the settings/hosts
  screens. Mobile mirrors with its six readers.
- Electric is being removed; this migration removes presence from the
  `v2Hosts` shape's load-bearing fields ahead of that.

## Shipping shape (final state directly, no interim scaffolding)

Two PRs, both targeting the end state:

1. **Server** — `presenceInfo` RPC + `/presence` route + e2e-probe coverage,
   **and** deletion of every relay2 DB presence write in the same change:
   `presence.ts`, the `presence()` wrapper, `presenceOnline` storage, the
   sweep's re-assert and offline writes. The sweep shrinks to pure socket
   hygiene (close anything silent past 90s), which is exactly what makes the
   DO's socket state truthful. Plus `host.list` enrichment and the dispatch
   gate reading the relay instead of the DB.
2. **Clients** — desktop + mobile `useHostsPresence` hooks and funnel
   migrations. Proto-gate is one branch: relay advertises `proto: 2` → poll
   `/presence`; otherwise keep the Electric/DB value (v1 customers keep
   today's behavior, and the v1 relay keeps writing the DB flag).

Older deployed clients read the now-static DB flag for relay2 hosts — accepted
churn per the cutover posture (D-20); canary auto-update turns them over in
days.

Survives until Fly retirement, then deleted with it: the trpc `setOnline`
mutation (the v1 relay is its only remaining caller), the sync-presence cron
(already flip-on-only via #6368), the `is_online` column (user-run drizzle
migration), and the client-side proto-gate fallback.

## Trade-offs accepted

- Poll cadence (~30s) replaces Electric push for the presence dot. Acceptable
  for a status indicator; revisit only if it feels laggy in practice.
- Relay unreachable ⇒ presence unknown. Honest: if the relay is down the host
  is unreachable anyway. Hooks report last-known + `stale` rather than
  fabricating `online`.

## Verification

- e2e-probe: `/presence` shows the probe host online while connected, offline
  after close, and omits hosts the token cannot access.
- Live: `superset hosts list` agrees with actual reachability for Town-Hall
  and satyas-mbp; kill a host-service daemon and watch `/presence` flip within
  one sweep without any DB involvement.
