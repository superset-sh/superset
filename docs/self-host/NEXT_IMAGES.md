# API, web and docs Node images

The generic Dockerfile builds the current Next dependency graph for one app.
It does not deploy a stack, provision a database or supply operator credentials.
The current source/configuration and staging controls have bounded tests. A
real Linux arm64 image build, trace audit and runtime smoke test remain required
before using an image operationally.

## Build inputs

Use the repository root as the Docker context and
`docker/self-host/next.Dockerfile`. `APP` must be `api`, `web` or `docs`.
The build requires digest-qualified `BUN_IMAGE` and `NODE_IMAGE` references.
Resolve and record compatible images for Bun 1.4.2 and Node 24 on Debian
bookworm, for the intended platform. The build checks the source Bun/Turbo
versions and requires Node major 24. It does not choose a mutable upstream base
for you. Record the resolved base and final application digests with the source
commit and build inputs; promote that same application digest after acceptance.

For example, after resolving the two base digests and setting public origins:

```sh
: "${BUN_IMAGE:?Digest-qualified Bun 1.4.2 image is required}"
: "${NODE_IMAGE:?Digest-qualified Node 24 bookworm image is required}"
: "${NEXT_PUBLIC_API_URL:?Public API origin is required}"
: "${NEXT_PUBLIC_WEB_URL:?Public web origin is required}"
: "${NEXT_PUBLIC_ADMIN_URL:?Public admin origin is required}"
: "${NEXT_PUBLIC_MARKETING_URL:?Public marketing origin is required}"

docker build --platform linux/arm64 \
  --file docker/self-host/next.Dockerfile \
  --build-arg APP=api \
  --build-arg BUN_IMAGE="$BUN_IMAGE" \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  --build-arg NEXT_PUBLIC_WEB_URL="$NEXT_PUBLIC_WEB_URL" \
  --build-arg NEXT_PUBLIC_ADMIN_URL="$NEXT_PUBLIC_ADMIN_URL" \
  --build-arg NEXT_PUBLIC_MARKETING_URL="$NEXT_PUBLIC_MARKETING_URL" \
  --tag superset-api:accepted-source .
```

Do not pass tokens, passwords or operator env files through build arguments.
The API/web build command uses fixed fake dependency initialization values so
module collection can initialize the existing DB/KV/queue/email clients. Those
values are command-scoped and the independent runtime stage contains no fake
credential defaults or `SKIP_ENV_VALIDATION`. Real runtime configuration still
has to satisfy the existing application schemas. The docs build requires no
DB/auth placeholders.

Required public inputs:

| App | Required build arguments |
| --- | --- |
| API | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_MARKETING_URL` |
| Web | All API inputs, plus `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_RELAY_URL`, `NEXT_PUBLIC_REALTIME_URL`, `RELAY_URL`, `RELAY_BACKUP_URL`, `REALTIME_URL`, `USERCONTENT_URL` |
| Docs | `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_API_URL` |

`NEXT_PUBLIC_RELAY_URL` is the browser WebSocket origin. Set
`NEXT_PUBLIC_REALTIME_URL` to the HTTPS realtime origin: the page comments client first
requests a connection ticket over HTTPS, then connects over WebSocket.
The CSP includes both HTTP(S) and WebSocket forms of the corresponding
`RELAY_URL` and `REALTIME_URL` origins. Set `RELAY_BACKUP_URL` explicitly;
if a deployment intentionally has no separate relay failover, it may point at
the same relay rather than baking the cloud backup origin. `USERCONTENT_URL`
selects the published-page framing domain and its wildcard frame source.
These inputs do not provision those services or assert their availability.

Optional public arguments include `NEXT_PUBLIC_DOWNLOAD_URL` for desktop
download links in web/docs, `NEXT_PUBLIC_DESKTOP_URL`,
`NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_AUTH_PROVIDERS`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, each app's
`NEXT_PUBLIC_SENTRY_DSN_*` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT`. Empty optional
values use the existing application fallbacks. No Sentry upload token is passed
to this build. Runtime operator secrets do not belong in this list.

For an owned mobile app, the web image also accepts optional public
`APPLE_TEAM_ID` and `EXPO_PUBLIC_IOS_BUNDLE_ID` build arguments. Pass the same
team and bundle ID used for the native app to `APP=web`. The web build generates
the static Apple association response at `/.well-known/apple-app-site-association`;
changing its App ID requires rebuilding the image, rather than setting runtime
`docker run -e` values. Leaving both unset retains upstream identity defaults.
These fields do not supply signing credentials or prove native link acceptance.

Public values, generated docs canonical URLs, redirects and config CSP are
build artifacts. Rebuild when these values change; runtime `docker run -e`
cannot replace values already serialized into browser or standalone output.
Set the same corresponding origins at runtime where current server schemas and
callback builders need them.

## Graph, context and output

The pruning tool is pinned to the version declared in the source, and the
builder installs the pruned lock with `--frozen-lockfile --ignore-scripts`.
Skipping install scripts avoids the root desktop-native installation path;
the actual build graph still runs `@superset/i18n#build` and strict catalog
compilation before consuming apps. Docs runs its existing `fumadocs-mdx && next
build` script. The root Lingui wrapper and source patches are copied explicitly
because they support the pruned build/install. No shared checkout node_modules
are pruned or installed by this workflow.

`.dockerignore` excludes all env files (including templates), private key
containers, local databases, generated outputs and agent-local directories.
Build from an audited source checkout; Docker context filtering cannot identify
arbitrarily named credentials. No container receives a root checkout `.env`.

`NEXT_OUTPUT_STANDALONE=1` is the retained build-only opt-in. Default cloud
builds keep their original output and config. The API/web/docs configs include
the monorepo tracing root only in this opt-in. Turbo hashes the flag and public
inputs.

The release contains the monorepo standalone server tree, `.next/static` and
`public` where present. API does not require a public directory. Missing
entrypoints/assets fail the staging step. The runtime stage is an independent
Node image running as the `node` user, with no package installation or build
command. All three images listen on container port 3000 by default;
`PORT` may override it. `HOSTNAME=0.0.0.0` is set for container reachability.
The command is `node server.js` from `/app/apps/<APP>`.

## Acceptance still required

Before promotion, run the native Linux arm64 build for all three targets,
confirm strict catalog compilation and compatible native optional packages,
audit traced server/client files for accidental build-only values, and start
the runtime images with isolated fake services/operator fixture configuration.
Check health, static/public assets, docs canonical URLs, dynamic routes and
runtime env validation. A source-level config/staging pass is not an image
build or a proof that no import requests a service during Next page collection.
Do not point this acceptance at a shared database or a real provider account.

Database adoption, queue/relay/scheduler images, compose, ingress, backups,
rollback and release packaging are separate units. In particular, these images
do not apply migrations and do not change existing cloud deploy workflows.
