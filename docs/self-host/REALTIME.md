# Realtime Worker image

`docker/self-host/realtime.Dockerfile` builds the current `@superset/realtime`
Worker as a separate service. It retains the instrumented `OrgHub` export and
Worker routes. The `PageHub` constructor receives the existing read-only S3
adapter; its records, visits and consumed ticket nonces remain in Durable Object
SQLite. No application source, Cloudflare deployment or relay state is changed.

Supply digest-qualified `BUN_IMAGE` and `NODE_IMAGE` build arguments for the
selected Linux arm64 or x64 platform. Bun must match the source package manager,
and Node must be major 24. The image prunes the actual realtime graph, installs
its frozen lock with scripts disabled, and bundles with installed Wrangler.
The shared [runtime selector](WORKER_RUNTIME.md) copies the locked platform
workerd executable, with an explicit minimum version and integrity-pinned
override available for retained storage. Build and start that exact image in an
isolated stack before operational use.

## Runtime inputs

The container runs as `node` on port 8787. Supply these existing inputs at runtime:

- `NEXT_PUBLIC_API_URL`: API root origin, matching its JWT issuer and audience
  exactly. The Worker fetches `/api/auth/jwks` there.
- `USERCONTENT_URL`: the usercontent frame base. Page socket origins are
  `<pageId>.<frame host>` and must match the usercontent service.
- `NUDGE_SECRET`: the same secret as the API's `REALTIME_NUDGE_SECRET`.
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`: the private storage
  used by the API and usercontent service. Do not select the public avatar bucket.
  `S3_REGION` is optional and keeps the adapter's `garage` default. Endpoint paths
  used for signing must reach the same store without proxy rewrites.
- `SENTRY_DSN`: optional; only a nonempty value adds its binding.
- `REALTIME_PRIVATE_ADDRESSES`: optional comma-separated exact IPv4/IPv6
  addresses for outbound API JWKS or S3 traffic. Each becomes a /32 or /128 rule;
  default outbound access permits workerd's public network class. Wildcards,
  CIDRs and IPv6 zone identifiers refuse. DNS changes require an operator update
  and restart. This container input does not change machine or private network policy.

Origins reject credentials, query strings and fragments. API and frame inputs
are root origins; S3 may retain its signing base path. Configuration contains
environment binding names, never interpolated secrets. Missing required inputs
refuse startup before workerd runs.

## Storage and service contract

Mount a **fresh, separate** volume at `/data/realtime-durable-objects`, with
ownership matching the actual Node image UID/GID. Never reuse relay Durable
Object/placement storage or queue/Postgres data. The namespace keys
`superset_realtime_org_v1` and `superset_realtime_page_v1` are distinct and
immutable; keep them with the matching data generation when backing up or
restoring. Changing the keys or reinitializing storage changes object identity.
This image does not adopt or migrate another realtime deployment's state.

Ingress must pass HTTP and WebSocket upgrades unchanged. The genuine endpoints
include `/health`, `/v2/org/:organizationId/nudges`, `/v2/nudge`, and page storage
`ticket`, `socket`, `admin` and `manifest-changed` under `/v2/page/:pageId/storage/`.
API/client realtime origins must select this service; published-page frame
origins and secrets must agree across API, usercontent and realtime.

Before adoption, verify the actual image's TLS/JWKS authentication, authenticated
organization nudges, page ticket/socket origin and nonce checks, private manifest
reads, SQL persistence/revocation, restart/alarm behavior and backup/restore.
Health or mocked JavaScript tests do not establish native workerd, WebSocket,
RPC, SQLite, ingress or stored-state compatibility. Compose and ingress remain
operator configuration.
