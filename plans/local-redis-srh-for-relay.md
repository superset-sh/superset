# Run the relay locally against a real Redis

## Problem

`apps/relay` cannot run locally today. It hard-requires `KV_REST_API_URL` + `KV_REST_API_TOKEN` (`apps/relay/src/env.ts:8-9`) and reaches Redis through `@upstash/redis` (`apps/relay/src/directory.ts:1-13`), but `.env.local.example:129-131` ships placeholders that can never answer a request:

```
# Upstash Redis & QStash (fake for local dev)
KV_REST_API_URL=https://fake-kv.example.com
KV_REST_API_TOKEN=fake-kv-token
KV_URL=rediss://default:fake-kv-token@fake-kv.example.com:6379
```

The file contradicts itself twenty lines later — `RELAY_URL=http://localhost:4734` assumes you *are* running the relay locally. Anyone who tries hits a dead KV and reaches for a workaround (an in-memory directory branch keyed on `FLY_MACHINE_ID === "local"` was written and then reverted for exactly this reason). The fix belongs in the local stack, not in relay's production code path.

## Why not just run `redis-server`

`@upstash/redis` speaks Upstash's **HTTP REST** protocol, not the Redis wire protocol. A plain `redis:7` on `:6379` will not answer it. You need an HTTP shim in front.

## Solution: SRH

[`hiett/serverless-redis-http`](https://github.com/hiett/serverless-redis-http) (SRH) is an HTTP→Redis proxy that is wire-compatible with Upstash's REST API. Upstash [documents it in their own SDK docs](https://upstash.com/docs/redis/sdks/ts/developing) for local development and testing: *"We are working with Scott together to keep SRH up to date with the latest Upstash features."*

Due diligence, as of 2026-07-08:

| | |
|:--|:--|
| License | MIT |
| Stars | 247 |
| Last commit | 2026-01-06 |
| Last tagged release | `0.0.10`, May 2024 — so `:latest` is doing real work |
| Maintainers | effectively one (Scott Hiett), with Upstash collaboration |

Small, single-maintainer, and stale on tags. Acceptable for a **local-dev-only** container; it must never appear in a production path. It is also directly analogous to something we already depend on: `neon-proxy` (`ghcr.io/timowilhelm/local-neon-http-proxy`) is an HTTP shim in front of real Postgres, in this same compose file, for this same reason.

### Verified, not assumed

Ran the relay's **actual** `apps/relay/src/directory.ts` against SRH (not a toy `PING`). Every function, including the Lua `EVAL` scripts:

```
after register:  { region: "iad", machineId: "m1" }
after heartbeat: { region: "iad", machineId: "m1" }
sweepStale:      0
cleared:         1
after clear:     null
```

`register` / `lookup` / `heartbeat` / `sweepStale` / `clearStaleEntriesForMachine` all behave correctly. No relay code change is needed.

## Changes

Four files. Ports are allocated per-worktree, matching how `postgres` / `neon-proxy` / `electric` already work, so two worktrees can run relays at once without colliding on `:6379` / `:8079`.

### 1. `docker-compose.yml`

Add two services beside the existing three. No volume — the tunnel directory is ephemeral (TTL-scoped) and `teardown.local.sh` runs `down -v` anyway.

```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "${LOCAL_REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  serverless-redis-http:
    # HTTP shim so @upstash/redis can talk to the local Redis: the SDK speaks
    # Upstash's REST protocol, not the Redis wire protocol. Same role neon-proxy
    # plays for Postgres. Local dev only.
    image: hiett/serverless-redis-http:latest
    environment:
      SRH_MODE: env
      SRH_TOKEN: local_dev_token
      SRH_CONNECTION_STRING: "redis://redis:6379"
    ports:
      - "${LOCAL_SRH_PORT:-8079}:80"
    depends_on:
      redis:
        condition: service_healthy
```

### 2. `.superset/setup.local.sh`

The `+16` / `+17` slots are free (apps use `+0..+13`, pg `+14`, neon-proxy `+15`, electric reuses `+9`; the window is 20 wide).

- Declare `LOCAL_REDIS_PORT` / `LOCAL_SRH_PORT` beside the existing `LOCAL_*_PORT` vars (~line 23-25).
- In `local_allocate_ports` (~line 71): `LOCAL_REDIS_PORT=$((base + 16))`, `LOCAL_SRH_PORT=$((base + 17))`, add both to the `export` line and the `success` message.
- Add an SRH readiness wait mirroring the existing neon-proxy `curl` loop (~line 113):
  ```bash
  curl -s --max-time 3 -X POST "http://localhost:$LOCAL_SRH_PORT/" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer local_dev_token" \
    -d '["PING"]' | grep -q PONG
  ```
  Note the `Content-Type: application/json` header — SRH returns `{"error":"Invalid content type..."}` without it.
- In `local_write_env` (~line 184): write `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_URL`. These are **not** written today; they only come from the `.env.local.example` copy, which is why the port must be written here to stay consistent per worktree.

### 2b. `EXPO_PUBLIC_RELAY_URL` is never provisioned — separate, and more urgent

Independent of Redis. `apps/mobile/lib/env.ts:9` now requires `EXPO_PUBLIC_RELAY_URL` (`z.url()`, so a missing value throws at module load), and `host-client.ts:28` builds `${EXPO_PUBLIC_RELAY_URL}/hosts/<key>/trpc` from it. **Nothing anywhere sets it.** Greppable proof: the only hits in the whole repo are those two mobile files.

`apps/mobile/app.config.ts:7` loads the **root `.env`**, and `apps/mobile/eas.json` declares no `env` block. So both paths are broken:

- **Local** — `.superset/lib/setup/steps.sh` already allocates `RELAY_PORT=$((BASE + 13))` (`:507`) and writes `RELAY_URL` (`:537`) and `NEXT_PUBLIC_RELAY_URL` (`:534`, and again at `:538` — a harmless duplicate worth deleting). It writes `EXPO_PUBLIC_API_URL` (`:536`) but not the relay equivalent. Add beside it:
  ```bash
  write_env_var "EXPO_PUBLIC_RELAY_URL" "http://localhost:$RELAY_PORT"
  ```
  Same one-liner in `.superset/setup.local.sh` (`RELAY_PORT` at `:174`, writes at `:214-215`).
- **Production** — no repo file supplies it, so it has to be an EAS-hosted env var. Until it exists, a production/preview build of the mobile app **crashes at startup** on the `z.url()` parse. This must land before the mobile app ships with a required relay URL.

So `steps.sh` *does* need touching — for `EXPO_PUBLIC_RELAY_URL`, not for Redis. It never starts compose and never writes `KV_REST_API_*`, so the Redis changes stay confined to `setup.local.sh`.

### 3. `.env.local.example`

Replace the fake block (lines 128-131). Defaults match the compose defaults for anyone running compose directly without `setup.local.sh`:

```
# -----------------------------------------------------------------------------
# Upstash Redis (local: real redis behind the SRH HTTP shim) & QStash (fake)
# -----------------------------------------------------------------------------
KV_REST_API_URL=http://localhost:8079
KV_REST_API_TOKEN=local_dev_token
KV_URL=redis://localhost:6379
```

`QSTASH_*` stays fake — nothing local exercises it.

### 4. `DEVELOPMENT.md`

Item 3 of "What `setup.local.sh` does" currently reads:

> 3. Brings up Postgres + neon-proxy + Electric via `docker compose` (project-scoped to this worktree)

Add Redis + SRH. `## Prerequisites` needs no change (Docker is already listed).

## Not changing

- **`turbo.jsonc`** — `KV_REST_API_URL` / `KV_REST_API_TOKEN` are already in `globalEnv` (lines 19-20). Note `EXPO_PUBLIC_RELAY_URL` is *not* there; check whether Expo vars are expected in `globalEnv` before adding (no `EXPO_PUBLIC_*` currently is).
- **`apps/relay/src/index.ts`** — already serves `app.all("/hosts/:hostId/trpc/*")` (`:277`) behind `authMiddleware` (`:275`), which is exactly the route mobile calls. The deployed relay needs no change for mobile chat.
- **Root `package.json`** — relay is deliberately not in the default `dev` script (only `dev:relay` / `dev:all`). Starting Redis in compose does not imply starting the relay.
- **`AGENTS.md` / `CONTRIBUTING.md` / `README.md`** — none document local services or env vars; all defer to `DEVELOPMENT.md`.
- **`apps/docs/content/docs/setup-teardown-scripts.mdx`** — describes *user-configurable* per-workspace setup scripts, not our compose stack. Its `docker-compose down` lines are example JSON config.
- **`apps/relay/src/directory.ts`** — no code change. This whole plan exists so the code stays honest about its one storage backend.

## Verification

1. `./.superset/teardown.local.sh && ./.superset/setup.local.sh` — stack comes up, SRH readiness wait passes.
2. `.env` contains `KV_REST_API_URL=http://localhost:<base+17>`.
3. `bun run dev:relay` boots without env-validation failure.
4. Register a host and confirm `lookup` returns it — the mobile chat E2E over the relay is the end-to-end check.
5. Two worktrees can run `setup.local.sh` and `dev:relay` concurrently without port collision.

## Risk

SRH's `:latest` tag is unpinned and the project is small. If it breaks, pin a digest. Nothing in production depends on it: `FLY_MACHINE_ID` and the real Upstash KV govern deployed relays, and this touches neither.
