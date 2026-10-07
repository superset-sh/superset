# Native Worker runtime selection

The relay, realtime and usercontent Dockerfiles share
`docker/self-host/select-workerd.mjs`. Supply digest-qualified `BUN_IMAGE` and
`NODE_IMAGE` for the chosen Linux arm64 or x64 platform. Bun must match the
source package manager; the final Node image must use major 24 and a Debian-based distribution with the existing `node` account and `groupmod`/`usermod` tools. The runner checks this contract before normalizing that account to UID/GID 1001. Alpine and distroless Node bases are unsupported.

The default runtime comes from the installed Wrangler dependency in the frozen,
pruned application graph. The selector checks the workerd dependency version,
the Cloudflare platform package metadata, and the executable's ELF architecture.
It copies the binary without executing it or running package lifecycle scripts.
Each final image contains `/worker/workerd-runtime.json`, recording its version,
platform, package and binary SHA256.

## Existing storage and explicit overrides

Before building for retained Durable Object storage, inspect the previous
image's actual runtime version and set `WORKERD_MINIMUM_VERSION` to that version.
A default binary older than this floor refuses the build. A compatibility date
or a matching namespace key alone does not establish stored-state compatibility.

When the frozen default is too old, an operator can set these Docker build
arguments together:

- `WORKERD_OVERRIDE_VERSION`: an exact workerd version at least as new as both
  the locked dependency and the explicit storage floor.
- `WORKERD_OVERRIDE_SHA512`: the exact `sha512-…` integrity value for that
  version's Cloudflare Linux platform package from the official npm registry.

An override fetches only the exact official package metadata and tarball.
Metadata identity and integrity must match the supplied pin. The compressed
archive is verified before bounded decompression; only the regular
`package/package.json` and `package/bin/workerd` members are read. Version,
platform, architecture, integrity or output collisions refuse the build.
There is no fallback to an older runtime or a global install.

These are container build arguments, outside the application environment
schemas, templates and cloud deployments. Keep the selected platform's pin,
base-image digests and runtime record with the image provenance. An npm integrity
match proves artifact bytes; it does not prove native libraries or storage
compatibility.

## Native acceptance

Build and run the exact image on its selected Linux platform before deployment.
Check the Node version, workerd libraries, CA-backed HTTPS, capnp bindings,
Worker routes, and the actual data-volume UID/GID. For persistent services,
rehearse a copied backup with the original namespace key, verify restart and
restore, and retain the prior image and data generation for rollback.

See [relay](RELAY.md), [realtime](REALTIME.md) and [S3 storage](STORAGE.md) for
service bindings and acceptance checks. Usercontent runs the current Worker and
S3 adapter with a separately rendered configuration. Its optional
`USERCONTENT_PRIVATE_ADDRESSES` accepts only exact comma-separated IPv4/IPv6
addresses for outbound private endpoints; defaults allow public addresses.
Existing `S3_REGION`, `SENTRY_DSN` and `USERCONTENT_TOKEN_SECRET_PREVIOUS` bindings
are included only when nonempty. Changing these inputs changes the container
configuration, not private network policy or the host firewall.
