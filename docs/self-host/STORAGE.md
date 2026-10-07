# S3-compatible storage

With `S3_ENDPOINT` unset, the API keeps the existing Cloudflare R2 storage and Cloudflare image transformations. To select generic S3, set every storage value in `docker/self-host/storage.env.example`. The API then requires `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`, and `S3_PUBLIC_URL`; Cloudflare storage values can be absent. `S3_REGION` defaults to `garage`. Providers with another region must set it.

`S3_ENDPOINT` is for API and Worker traffic, often an internal container address. `S3_PRESIGN_ENDPOINT` is for client GET/PUT signatures and must reach that same store from browsers and desktop clients. It falls back to `S3_ENDPOINT`. Keep the host/path used when signing intact in proxies: rewriting it invalidates SigV4 signatures. Desktop builds must receive the same public `S3_PRESIGN_ENDPOINT`; the HTML CSP extracts its HTTP(S) origin and rejects credentials. Turbo passes these inputs and includes them in build cache keys. An existing desktop build cannot learn a new CSP origin from API configuration: rebuild it.

The buckets must be different. Pages, every page version, manifests, assets and file attachments stay in `S3_BUCKET`. Its Garage website access is explicitly disabled. Only avatars and organization logos go in `S3_PUBLIC_BUCKET`, whose website access is enabled. `S3_PUBLIC_URL` must serve that public bucket directly and be reachable by all clients; avatars use the original object key without Cloudflare transformation paths. Never expose the private bucket through a website route, public alias, CDN or prefix proxy. Keep page and file reads behind the existing usercontent Worker ticket/visibility checks, even when a page's current version is public.

## Local Garage

Copy the example to a separate operator-owned file and fill fresh credentials. Garage needs a 64-hex RPC secret, an admin token, an access key `GK` followed by 24 hex characters, and a 64-hex S3 secret. Generate each with a cryptographically secure generator. Never use a shared API `.env` to run disposable tests.

```sh
docker compose --env-file /path/to/storage.env -f docker/self-host/compose.storage.yml up --build -d
```

This storage-only compose file creates a persistent Garage volume and publishes S3/website ports on loopback. It does not start or migrate a database or launch the API. Applications in the same Docker network use `http://garage:3900`; a host process uses `http://localhost:3900`. Host-header routing on the website endpoint selects `superset-public.web.garage.localhost` by default. Use the public bucket's hostname in production; do not route the private bucket's hostname there. Change the bucket names and website host together.

The initializer applies a single-node layout only on a fresh cluster, creates both buckets, checks that their physical bucket IDs differ, imports a new key or verifies the retained key secret, grants it access, denies the private website and enables the public website. Re-running it reconciles website and CORS policy. A changed secret for an existing key refuses before policy writes. To rotate, supply a distinct freshly generated access key and secret, reconcile and verify both buckets with the new pair, switch all API/Worker callers, then revoke the old key only after those callers pass. Preserve the old pair for rollback until verification completes. A failed command stops provisioning. A single-node layout is an operator choice for this example, not a resilient production topology.

`STORAGE_CORS_ORIGINS` is a JSON array of exact upload-client origins. Include the deployed web origin, the actual desktop dev origin, and `"null"` for a packaged file renderer. Each origin gets its own CORS rule, with lowercase `content-type`/`content-length` headers, GET/HEAD/PUT, and ETag exposure. Garage v2 compares allowed header case and emits all origins from a matching rule in `Access-Control-Allow-Origin`, so combining several origins in one rule fails browser validation. Presigned requests still require the valid signature; CORS is not authorization. Replace the local origins when deploying. Do not use `*`.

## Usercontent Worker

`docker/self-host/usercontent.Dockerfile` prunes to the usercontent dependency graph with the same Turbo pattern used by the upstream bot image, installs from the pruned frozen lockfile with scripts disabled, bundles the current upstream `apps/usercontent` with Wrangler's offline dry run, then runs it in workerd. The wrapper fills only `PRIVATE` with a signed read-only S3 adapter; it does not change the upstream routes, manifest visibility, ticket validation, public-version selection, persistent page storage script or response policy. The adapter supports missing objects, streaming bodies and byte ranges. Its bucket has no default and must equal the API's `S3_BUCKET`.

Pass only `USERCONTENT_URL`, `MEDIA_URL`, `APP_URL`, `REALTIME_URL`, `FRAME_ANCESTORS`, `USERCONTENT_TOKEN_SECRET`, and the four required private storage values (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) plus optional `S3_REGION` in `usercontent.capnp` to this container. API/Worker public origins and ticket secret must agree. Bind `PRIVATE` to the private bucket, not the public avatar bucket. The bundle's Cloudflare binding remains unchanged for cloud deployment. Token rotation and Sentry are upstream optional settings; add a capnp binding only when a nonempty value is configured, since unset `fromEnvironment` values become null rather than undefined. The full runtime compose must separately wire this container, relay/realtime and API; the storage example does not do that.

## Existing one-bucket installations

Do not silently rename the public bucket or expose the old private bucket to preserve avatar URLs. Back up the existing store and image URL rows first. Create a separate website-enabled public bucket, copy only keys referenced by avatar/logo rows (including `original`, `256.webp` and `64.webp` variants), and verify the copies before updating those rows to the new public origin. Keep the owner prefix and key unchanged. Inventory any other intentionally public assets before copying them; never copy `pages/` or `files/` into the public store. Disable website access to the old private bucket and remove any raw website/CDN route or public alias before resuming service.

Use an explicit reviewed data-migration procedure for your installation; this port performs no automatic object or database migration. Old URLs at a different public origin are not automatically reclaimed, so remove those objects only after checking that no rows still refer to them. Old direct and Cloudflare-transformed URLs at the current public origin are reclaimed within the same owner prefix after a successful row update. If a row update fails, the new object is deleted and the old image is retained; a cleanup failure is logged and leaves an orphan for operator reconciliation.

## Environment wiring

Desktop uploads to a storage origin outside the existing policy also require
the configured S3 `connect-src` change in
[PR #8231](https://github.com/superset-sh/superset/pull/8231). Land that policy
prerequisite before enabling this flow. The storage adapter alone does not
change the packaged desktop's content policy.

The server schema, both root examples, Turbo inputs, and both deploy workflows contain the optional S3 keys. Examples leave S3 disabled, so local setup does not accidentally switch existing R2 development stores. Optional keys need no cloud secrets while unset. Operators selecting S3 must supply the complete set to their API runtime, Worker runtime and desktop build as described above. No shared root `.env`, GitHub secrets or running deployment is changed by this port; configuring those values is a separate operator action.

## Disposable verification

`docker/self-host/storage.integration.ts` intentionally runs only when explicitly invoked with a disposable credential file. It expects test S3/website ports 49300/49302 and fresh buckets; do not point it at an existing store. It writes test manifests, versions, avatars and files, checks anonymous website denial, the S3 adapter's signed reads/ranges, exact-origin OPTIONS and a signed PUT, then removes those keys. `STORAGE_WORKER_PROOF=1` also expects workerd on loopback 49487 and checks a public shared version, a private historic version without/with a ticket, denial of raw history URLs, file-ticket access and byte ranges. The workerd test uses only the nondefault disposable `USERCONTENT_TOKEN_SECRET` from `STORAGE_TEST_ENV_FILE`, matching the test Worker and at least 32 characters long and must never be run against a shared service.

```sh
STORAGE_TEST_ENV_FILE=/path/to/disposable-test.env SKIP_ENV_VALIDATION=1 \
  bun test ./docker/self-host/storage.integration.ts
```

These are HTTP/runtime checks. The packaged Electron renderer and production proxies still need release verification with the real deployed origins.

## Build-context verification

The Docker context excludes human/generated Worker `.dev.vars` secrets, real `.env`/`.envrc` files, local `superset-dev-data` auth/database state, root MCP configuration and generated `.wrangler` state. The `.env.example`, `.env.local.example` and `.dev.vars.example` templates remain included.

`python3 docker/self-host/verify-context.py --docker-context <local-context>` copies the current ignore rules into a disposable `/tmp` context with dummy sentinels, builds `COPY .` using an existing local Docker-driver builder, exports the stopped fixture container, and verifies excluded files and allowed templates/source. It never copies the real checkout into that fixture, and removes its temporary image/container. It refuses non-Unix Docker endpoints, inactive builders and remote/container builders.
