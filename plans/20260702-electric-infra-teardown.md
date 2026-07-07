# Electric infrastructure teardown (remaining)

**Status:** Deferred. App-level removal is done and merged in PR #5396; the
standalone Electric *service + provisioning infra* is left in place, unused.

## Why this is deferred, not done

No application uses ElectricSQL at runtime anymore. Desktop and mobile poll
`sync.pull` (tRPC) and desktop workspaces are local-first via host-service
SQLite — verified over CDP with zero `/v1/shape` requests. The pieces below are
**dead weight, not a live dependency**: they still get provisioned, but nothing
connects to them.

They're left in one intentionally-unmerged batch because they're **tightly
coupled and unverifiable in an agent session**: setup writes the proxy's
`.dev.vars`, waits on the docker `electric` container, generates the
`Caddyfile`, and manages Postgres replication slots. Ripping out ~150 lines of
provisioning shell blind risks breaking `bun setup` / workspace creation for the
whole team, and it can only be validated by running `bun setup` against a fresh
workspace. That belongs in its own small PR with a human running setup once, not
a marathon edit.

## What remains (all unused)

| Piece | Location | Notes |
|---|---|---|
| Proxy app | `apps/electric-proxy/` | Only remaining `@electric-sql/client` import. Nothing calls it. |
| Root dev scripts | `package.json` `dev`, `dev:desktop`, `dev:caddy` | `--filter=electric-proxy` + `dev:caddy` (`caddy run --config Caddyfile`) |
| Docker service | `docker-compose.yml` ~L36–47 | `electric:` service, `image: electricsql/electric:1.7.4` |
| Caddy | `Caddyfile` | File contains **only** the electric HTTPS→wrangler reverse-proxy block |
| CI deploy | `.github/workflows/deploy-production.yml` ~L448 | `deploy-electric-proxy:` job (`working-directory: apps/electric-proxy`) |
| Setup/teardown shell | `.superset/setup.local.sh` (27), `.superset/lib/setup/steps.sh` (62), `.superset/lib/setup/main.sh` (6), `.superset/lib/teardown/steps.sh` (17), `.superset/lib/teardown/main.sh` (6) | ~118 refs. Ports `CADDY_ELECTRIC_PORT`/`WRANGLER_PORT`/`ELECTRIC_PORT`, `ELECTRIC_SECRET`, replication slots, `Caddyfile` generation, proxy `.dev.vars` |

## Removal steps (own PR)

1. Delete `apps/electric-proxy/`.
2. `package.json`: drop `dev:caddy` and `--filter=electric-proxy` from `dev` and
   `dev:desktop`; delete the `dev:caddy` script.
3. `docker-compose.yml`: remove the `electric:` service block.
4. Delete `Caddyfile` (nothing else uses it — confirm with a repo grep first).
5. `deploy-production.yml`: remove the `deploy-electric-proxy` job.
6. `.superset/` scripts: read each electric section before cutting — proxy
   `.dev.vars` writes, docker-`electric` wait/health, `Caddyfile` generation,
   replication-slot setup, and the `CADDY_ELECTRIC_PORT`/`WRANGLER_PORT`/
   `ELECTRIC_PORT`/`ELECTRIC_SECRET` allocations in both setup and teardown.
7. `bun install`, then `grep -rn "electric\|Electric\|Caddy" .` → expect zero
   hits outside this doc / lockfile history.

## Verification gate (do not merge without)

Run `bun setup` on a **clean** workspace and confirm it completes and a
workspace boots. This is the step no agent can perform safely — it's the whole
reason the batch is deferred.
