# Relay Hardening & Horizontal Scale-Out

**Author:** Satya · **Date:** 2026-04-20 · **Linear:** SUPER-427

## Context

The relay is how remote desktop hosts proxy HTTP + WebSocket traffic to clients on the web. It's a Hono + `@hono/node-ws` server on fly (`superset-relay`, `sjc`) that accepts two kinds of connections:

1. **Host-side** — desktops open `wss://relay.superset.sh/tunnel?hostId=<id>&token=<jwt>`. Relay calls this a "tunnel" and keeps an in-memory `Map<hostId, TunnelState>` (`apps/relay/src/tunnel.ts:30`).
2. **Client-side** — web/desktop clients call `/hosts/:hostId/trpc/*` (HTTP) or upgrade `/hosts/:hostId/*` (WS). Relay looks up the tunnel and forwards the frame via the host-side WS.

The service has been working for internal users but is about to take a large traffic step-up. The 2026-04-20 debugging session exposed a set of issues that will get much worse at scale. Two were patched live (multi-machine sharding → pinned to 1 machine; terminal WS URL bug); everything else is open (SUPER-427).

This plan proposes (a) a scale-out architecture that survives multiple fly machines and (b) a prioritized hardening backlog so we can ship in known-small increments.

## Goals

- Horizontally scalable relay — adding machines increases capacity, not 503 rate.
- No stuck `is_online` state in the DB; what the UI shows matches reality within seconds of a drop.
- Streaming proxies (SSE, tRPC subscriptions, WS) work end-to-end.
- Graceful shutdown: deploys / scale-down don't drop live tunnels abruptly.
- Single pane of glass for "who's connected, on which machine, since when".

## Non-goals

- Geographic distribution (multi-region). We stay in `sjc` for now; lat is dominated by host<->relay and client<->relay legs individually.
- Replacing JWT auth. Current token flow is fine.
- Migrating off fly.

## Decision: scale-out architecture

**Pick: fly-replay sticky routing + Redis directory.** Each relay machine continues to hold tunnels in-process. When a proxy request lands on a machine that does not own the target tunnel, the machine replies with `fly-replay: instance=<owning-machine-id>` — fly's proxy re-routes the request to the owning machine, which handles it locally. Tunnel ownership is published to Redis on register, removed on unregister.

### Rejected alternatives

- **Pub/sub message bus (every request piped through Redis/NATS).** Adds a latency hop per request *and* per response frame; correlation-id bookkeeping duplicates fly's routing layer; Redis pub/sub has no delivery guarantees so we'd need acks on top. No gain over sticky routing.
- **Dedicated subdomain per tunnel** (e.g. `<hostId>.relay…`). Requires wildcard DNS + per-tunnel fly machines, order-of-magnitude more infra.
- **Vertical scaling only.** One big box is a single point of failure during deploys and hardware faults. Fine as a fallback but not a plan.
- **Consistent-hash routing at the fly edge.** Fly's proxy doesn't natively hash by header/query; would need a custom edge. Not worth it.

### Why fly-replay works here

- One-hop re-routing: the first machine hit does a ~200µs Redis `HGET` and returns the replay header; fly re-issues the request to the correct instance. For tunnels that stay on the same machine for their whole lifetime (vast majority), most requests hit the right machine on the first try after fly's LB learns affinity.
- WS upgrades are in scope for `fly-replay` as of 2024.
- Ownership directory is tiny (one row per live tunnel); Redis HSET is the right shape.
- No request payload ever transits Redis — Redis just stores ownership and heartbeat timestamps.

### What Redis stores

```
HSET tunnel-owner <hostId> <machineId>            # set on register, DEL on unregister
HSET tunnel-meta  <hostId> <json-blob>            # registeredAt, lastPongAt
ZADD tunnel-ttl   <expireAt-ms> <hostId>          # for stale-owner cleanup
```

TTLs are enforced by a periodic sweeper on each machine (SCAN the ZSET, drop rows older than 2× ping interval without a refresh).

### Redis itself

**Reuse the existing Upstash instance** (`KV_REST_API_URL` / `KV_REST_API_TOKEN`, already used by `packages/auth/src/lib/rate-limit.ts` and a dozen api routes). No new infra, no new secrets, no new failure mode to monitor. Write through the `@upstash/redis` REST client we already depend on.

Rejected alternatives:
- **Fly's "Managed Redis" add-on.** It is just Upstash under the hood (reseller relationship; product has since been de-emphasized). Zero latency or feature win over using Upstash directly.
- **Self-hosted Redis on a fly machine behind flycast.** Sub-ms latency via the wireguard network, but we own replication, backups, HA, and deploy sequencing. Not worth it for ~few-hundred ops/sec.
- **Putting Upstash behind fly's private network.** Upstash's REST endpoint is public-internet HTTPS; they don't expose a flycast-routable endpoint. Can't keep it inside the VPN.

Latency budget: Upstash REST from fly `sjc` is ~5–15ms round-trip. That is only paid on *cross-machine* proxy requests — once fly's LB learns affinity, the owning machine handles requests in-process with no Redis hop. Register/unregister are one-shot so the hop doesn't matter there either.

## Proposed phases

Each phase is independently shippable and individually provides value. Ordered by ROI; phase 1 blocks phase 2.

### Phase 0 — freeze known-good (done, this session)

- [x] `max_machines_running = 1` in `apps/relay/fly.toml` (PR #3599).
- [x] Terminal WS URL bug (PR #3599).

These keep prod stable while we execute the rest.

### Phase 1 — shared-state scale-out (the big one)

**Blocks being able to run >1 machine. Everything in later phases benefits from this.**

Workstreams:

1. **Tunnel directory in Redis.** New module `apps/relay/src/directory.ts`: `register(hostId, machineId)`, `unregister(hostId)`, `lookup(hostId) → machineId | null`, `heartbeat(hostId)`, `sweepStale()`. Fly machine id from `FLY_MACHINE_ID` env. Uses `@upstash/redis` pointed at the existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` — same instance the api's rate-limiter already uses. Key prefix `relay:` so it can't collide with other users of the instance.
2. **Fly-replay routing.** In `authMiddleware` (after access check, before tunnel lookup): if `tunnelManager.hasTunnel(hostId)` is false, call `directory.lookup(hostId)`. If another machine owns it, respond with `fly-replay: instance=<machineId>` + 200. If no owner, keep returning 503.
3. **WS upgrade replay.** `@hono/node-ws` upgrade path needs to set `fly-replay` before the upgrade response. Needs a small detour — we can't replay after `Sec-WebSocket-Accept`. Verify fly honors the header on 101 upgrade. If not, we do an HTTP pre-flight `/hosts/:hostId/_whoowns` first that returns the replay header. Clients already hit `/tunnel` once, so adding a single pre-flight per WS open is fine.
4. **Clean register/unregister lifecycle.** Current `register()` at `tunnel.ts:38` closes the NEW socket if the old one is still present. Flip to last-write-wins: close the OLD tunnel, take the new one. Prevents flaky clients from getting permanently stuck behind a dead-but-not-yet-detected WS.
5. **Flip cap back up.** Remove `max_machines_running = 1`, scale to 2, verify via `fly logs` that tunnels are served from both machines and proxy requests get routed correctly.

**Exit criteria:** `fly scale count 3 -a superset-relay`, then have three of us connect our desktops, and every client request succeeds regardless of which machine the client's HTTP lands on.

### Phase 2 — truthful `is_online`

**Independently valuable; unblocks the "is X online?" UI question.**

- Boot-time cleanup: on relay start, `UPDATE v2_hosts SET is_online = false WHERE is_online = true` filtered to rows not present in the local in-memory map (once phase 1 lands, filter to rows not in the Redis directory). ~5 lines.
- Periodic reconciliation: every 30s, reconcile DB state against the Redis directory. Drift → DB loses, directory wins.
- Move the is-online write off the hot path: today we fire `device.setHostOnline.mutate(...)` against the API on every register. With thrash (flaky clients reconnecting) this is a lot of writes. Batch or debounce.

**Exit criteria:** Kill a relay machine with `fly machine stop`; within 60s, every host that was on it is flipped to `is_online=false` in the DB and the UI reflects it.

### Phase 3 — streaming support

**Probably the biggest latent correctness bug.** Currently `tunnel-client.ts:144` does `await response.text()` — the entire HTTP response body is buffered on the host before being sent to the relay. That kills SSE, tRPC subscriptions, and any chunked response. Chat streams work today only because they use `httpBatchStreamLink` to the tRPC endpoint which the host then terminates; the relay tunnel itself isn't streaming.

- Change the tunnel protocol from `{type: "http:response"}` one-shot to `{type: "http:response:start", headers, status} + {type: "http:response:chunk", data} + {type: "http:response:end"}`.
- Relay side: pipe chunks directly to the `Response` body stream.
- Same treatment for large request bodies (today `await c.req.text()` in `index.ts:118`).

**Exit criteria:** a 10MB file download through the tunnel starts arriving client-side before the last byte leaves the host.

### Phase 4 — reliability & graceful shutdown

- **SIGTERM handling on relay.** Intercept SIGTERM (fly sends this on scale-down/deploy), stop accepting new tunnels, send a close frame `{code: 4001, reason: "server-drain"}` to every tunneled host, wait up to 10s for graceful close, then exit. Hosts treat code 4001 as "reconnect immediately, no backoff."
- **Client-side missed-pong detection.** Today the client only reconnects on `onclose`. Add a dead-socket detector: if no `onmessage` (including pings) for 45s, forcibly close and reconnect. Server pings every 30s (`tunnel.ts:55`); three missed pings = 90s to detect, too slow. Also have the client send an app-level ping every 15s so the server can detect dead clients sooner (currently the server only knows about client liveness via TCP).
- **Tighter ping cadence.** 10s ping interval, 3 missed = 30s to detect. Tradeoff: ~10 ping frames/minute/host × 1k hosts = 166 msg/s, trivial.
- **Request timeout policy.** `REQUEST_TIMEOUT_MS = 30_000` at `tunnel.ts:33` is too short for some tRPC calls (chat.sendMessage saw 11s already). Raise to 120s, and mark streaming requests (phase 3) as never-timing-out at this layer.
- **Backoff cap lowered.** `RECONNECT_MAX_MS = 30_000` is fine but combined with TCP FIN timing a dead server isn't noticed for up to ~90s. Not a backoff issue; the missed-pong detector above fixes it.

### Phase 5 — observability

- **Admin endpoint.** `GET /admin/tunnels` (auth-gated by a shared secret env var, not user JWT), returns `[{ hostId, machineId, connectedAt, pendingRequests, activeChannels, lastPongAt }]` read from Redis. Replaces the "grep fly logs" workflow.
- **Metrics.** Ship Prometheus-format metrics at `/metrics` or push to fly's built-in metrics:
    - `relay_tunnels_current` (gauge, per machine)
    - `relay_tunnel_register_total`, `relay_tunnel_unregister_total`
    - `relay_request_total{status,route}`
    - `relay_request_duration_seconds{route}` histogram
    - `relay_proxy_errors_total{reason}` (timeout, tunnel_missing, remote_error, ...)
    - `relay_replay_hits_total{cross_machine=true}` — fraction of cross-machine replays (too high = need sticky LB tuning)
- **Structured logs.** Today logs are `[relay] ...` strings. Move to JSON via `pino` or similar with `{ level, msg, hostId, userId, machineId }` on every line; grep-friendly + pipable to any log provider later.
- **Alerts.** Starting set, alertmanager/sentry routing:
    - 503 rate > 2% sustained 1m
    - tunnel register → unregister in < 5s (flapping)
    - replay hit rate > 40% (routing fighting us)
    - p95 proxy latency > 2s

### Phase 6 — data-model fixes

- **Decouple `name` from `v2_hosts`.** Today every `(org, machine_id)` row carries its own `name`. Two registrations of the same physical machine can have different names. Lift `name` (and probably `os`, `cpu_count`, `total_memory`, `agent_version`) to a `v2_machines` table keyed by `machine_id`; `v2_hosts.machine_id` FKs in. Migration: backfill `v2_machines` from existing distinct `(machine_id, most_recent name)`, drop `name` from `v2_hosts`.
- **Fix UUID-as-name leak.** Find the register codepath that sometimes passes a UUID where the hostname should go (`v2_hosts.id = 7cd349d5-…` has `name = '2b5fb23d-…'`). Likely in `device.setHostOnline` or a register-adjacent mutation in `packages/trpc/src/router/device/device.ts`. Once in `v2_machines`, this bug becomes impossible because `name` is no longer written on register.
- **Add telemetry columns to `v2_hosts`:** `last_connected_at`, `last_disconnected_at`, `connected_machine_id`. Useful for debugging "when did it last talk to us?" without tailing fly logs.

### Phase 7 — load testing

- Script: spin up N synthetic hosts (just `tunnel-client.ts` pointed at a mock local port) + M clients hammering `/hosts/<id>/...`. Measure p95 latency, CPU, memory, FD count per machine.
- Target capacity plan (guess, to validate): 5k concurrent tunnels per `performance-2x` machine with < 50ms p95 pass-through.
- Fault injection: kill a machine mid-run, verify clients reconnect within 30s.

## Open questions

- **Authorization on the admin endpoint.** Shared secret vs user JWT with role check? Shared secret is simpler and keeps `/admin/*` out of the normal auth path. Probably the right call.
- **Do we want a `v2_machines` table, or fold `name` etc. onto `devices`?** There's already a `device_presence` table that the MCP server reads. Might be simpler to converge those rather than add a third. Worth discussing with Avi/Kiet before phase 6.
- **Fly region.** Staying in `sjc` means ~80ms RTT from EU hosts. Could shard to `fra` later, but scale-out-within-region first.
- **TLS inside the tunnel?** Relay terminates TLS from the client and opens a plaintext WS to localhost on the host. Fine since the host-service WS is on loopback. Worth documenting so nobody bolts TLS on unnecessarily.

## Milestones / ETA

Rough; assumes one person (me) full-time, review async.

- Phase 1: 4–5 days. The real work.
- Phase 2: 1 day.
- Phase 3: 2–3 days.
- Phase 4: 2 days.
- Phase 5: 2 days.
- Phase 6: 1 day + DB migration review.
- Phase 7: 1 day.

Total ~2.5 weeks if done serially, less with parallel review.
