# Current relay Worker image

`docker/self-host/relay.Dockerfile` bundles the current `@superset/relay` app from
`apps/relay` with frozen pruned dependencies and Wrangler dry-run. The application,
authentication, tunnel protocol and instrumented `HostTunnel` export stay
unchanged. `relay2` is a retained deployed naming convention, not another app.

Supply verified digest-qualified `BUN_IMAGE` and `NODE_IMAGE` build arguments.
Bun must match source packageManager; Node runtime must be major 24. Turbo 2.10.9
prunes the real relay graph. The default workerd executable is copied from the
platform package selected by the locked Wrangler dependency. Retained storage
requires an explicit minimum runtime version; an override also requires the
exact official platform package integrity pin. See
[Worker runtime selection](WORKER_RUNTIME.md). Supported extraction targets are
Linux arm64 and x64. The current Worker compatibility date 2026-07-01 and
nodejs_als flag match Wrangler. Build checks do not establish publisher provenance,
Linux binary/library acceptance or actual workerd execution; verify those before
operational use. The CA bundle copied from the Bun image must also be audited.

## Runtime contract

The container runs as the Node image's unprivileged `node` user and exposes port
8787. It serves the genuine Worker through workerd, adding only a disk-backed
placement KV get/put binding. No Cloudflare account or provider credential is
required for this wrapper. Configure these values explicitly:

- `NEXT_PUBLIC_API_URL`: public API root origin, agreeing **exactly** with the
  API's JWT issuer and audience. HTTP is supported for an isolated local stack;
  externally published deployments need their operator-owned HTTPS origin. No
  credentials, path, query, fragment or encoded authority is accepted. Validation
  preserves the original value for the existing Worker/JWT contract.
- `RELAY2_DO_DIR`: absolute Durable Object directory, default
  `/data/durable-objects`.
- `RELAY2_PLACEMENT_DIR`: absolute placement record directory, default
  `/data/placement`. It must be physically separate from, and not nested in,
  the Durable Object directory, including through symlink aliases.
- `RELAY2_DO_UNIQUE_KEY`: optional explicit namespace key. If absent, the renderer
  generates and persists one. If configured and it conflicts with the stored
  key, startup refuses; it does not orphan or silently reinitialize existing
  object storage. Values use nonempty ASCII letters, digits, underscore or hyphen.
- `RELAY2_API_PRIVATE_ADDRESSES`: optional comma-separated exact IPv4/IPv6
  addresses reachable by the workerd outbound binding. Default permits only
  workerd's public network class. No wildcard, CIDR range or IPv6 zone identifier
  is accepted; each address becomes a /32 or /128 rule. DNS changes need an
  explicit operator update/restart. This does not change machine/network policy.
- `SENTRY_DSN`: optional existing Worker capability. Only nonempty configuration
  adds the binding. No value is embedded in the generated capnp configuration.

The `RELAY2_*` names retain the released container/operator contract. These are
container-only inputs to the wrapper, not new application environment schemas,
Turbo cache keys or cloud deploy variables. Existing API/host/renderer relay
URLs remain their own documented configuration. No application env template,
cloud Worker route, KV ID or registry is modified by this image unit.

The Durable Object namespace key seeds object identity and therefore belongs
with its data. It is created with a complete private temporary file followed by
an atomic hard link, then directory sync; concurrent initial renders reuse the
single complete stored key. Existing regular private key files are retained,
including their released terminal-newline convention. Symlinks, public file
permissions and malformed key files refuse. Configuration output is separately
written atomically with mode 0600. Neither key nor configured private inputs are
logged. These filesystem controls do not protect against an operator mutating
the directories concurrently outside the wrapper.

Mount the Durable Object and placement data separately and verify ownership
against the actual image's Node UID/GID. Keep the generated `.do-unique-key` with
the Durable Object backup; changing or losing it changes object identity.
Restore both data directories and the matching key as one deployment generation.
Do not share them with queue SQLite or Postgres. Retaining `RELAY2_*` names does
not itself prove adoption of an old workerd storage version or backup. Existing
physical volume names are operator inputs and need not be renamed because the
Dockerfile now says relay.

## Placement behavior and limits

Only the get/put surface used by current placement.ts is implemented. Missing
records and malformed stored JSON return absent, allowing the existing control
channel to replace them. Disk read/write failures reject. Keys retain the
released percent-encoded URL representation; isolated wrapper tests verify that
representation, not workerd disk path decoding. Real workerd containment,
placement persistence/cache behavior, JWT/JWKS, TLS, WebSocket upgrade and tunnel
forwarding remain mandatory native acceptance. The genuine Worker retains its
existing at-least-eventual placement memo and access checks.

Before use, build/start the selected Linux platform in an isolated fixture,
verify non-root volume permissions, CA-backed TLS/public API reachability, exact
private-address exceptions if needed, DO namespace stability on restart,
placement persistence, health, authenticated control/reach/dial and stop/restore.
Wrangler dry-run, parsed capnp and JavaScript mocks are separate proofs and do
not substitute for these tests. Full compose, ingress, failover, monitoring,
backup/rollback and private deployment policy are later operator units. No live
provider, account, shared database or production deployment is verified here.
