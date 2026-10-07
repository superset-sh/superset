# Native queue and scheduler images

`docker/self-host/jobs.Dockerfile` packages the current native queue and scheduler
as separate `queue` and `scheduler` targets. It copies their genuine source and
the dependency-free shared queue contract; no dependency installation or build
is needed. The source packageManager must match the image's Bun version. Supply
a verified platform-specific or multi-platform image reference with a SHA-256
digest, not a mutable tag:

```sh
docker build --file docker/self-host/jobs.Dockerfile --target queue \
  --build-arg BUN_IMAGE="$BUN_IMAGE" --tag superset-queue:local .
docker build --file docker/self-host/jobs.Dockerfile --target scheduler \
  --build-arg BUN_IMAGE="$BUN_IMAGE" --tag superset-scheduler:local .
```

The build checks digest syntax and Bun version. It does not establish publisher
provenance, platform compatibility or image acceptance. Resolve and verify the
base image separately. Both targets run as the base image's `bun` user and invoke
Bun with `--no-env-file`. They contain no operator secret, API origin or native
mode default. The repository Docker context exclusions also apply here.

## Queue runtime

The queue listens on its existing port 8789. Keep that ingress within the
operator-controlled application network; it is not a public unauthenticated
service. Configure these values explicitly at runtime:

- `NEXT_PUBLIC_API_URL`: the canonical public API root origin used in published
  job destinations. It must agree with the API and SDK publishers.
- `QUEUE_API_URL`: the API root origin the worker can actually reach for delivery,
  for example a private application-network address. The worker maps only the
  validated public API's path/query onto this delivery origin.
- `SELF_HOST_QUEUE_SECRET`: a fresh operator-owned secret of at least 32
  characters, matching API native publication and delivery authentication.
- `QUEUE_DATABASE`: optional path, defaulting to `/data/queue.sqlite`.

Mount a persistent directory at `/data`, writable by the image's actual Bun
UID/GID. An empty named volume normally copies the image directory's ownership;
a bind mount or pre-existing volume needs explicit verified ownership. Do not
assume every base image uses the same numeric UID. Back up SQLite using a
consistent SQLite backup or stopped-volume procedure, including WAL state.
Never share this volume with Postgres or relay Durable Object storage.

The API independently requires `SELF_HOST_QUEUE=1`, `SELF_HOST_QUEUE_URL` pointing
to the queue's root service origin, and the same secret. Queue URL, public API
origin and internal delivery origin are distinct contracts; swapping them can
cause destination validation or authentication failures. Consult
[the environment guide](../environment-variables.md#native-self-host-job-queue).
No image exposes or defaults the secret. Avoid printing runtime configuration
or supplying it as an image build argument.

Native delivery is at least once. Durable acknowledgement can race a transport
timeout, so retry ambiguous publications with stable deduplication IDs. Queue
volume loss loses jobs and deduplication history; an image rebuild is not a
backup. Existing delivery, retry, failure-callback and retention behavior remains
unchanged.

## Scheduler runtime

Run one scheduler per logical deployment. Set `SELF_HOST_QUEUE=1`,
`SELF_HOST_QUEUE_SECRET`, and `QUEUE_API_URL` (or its existing
`NEXT_PUBLIC_API_URL` fallback). The scheduler calls authenticated API job routes
directly and needs no queue SQLite volume or inbound port. Native mode unset
retains the existing no-scheduler behavior; the image does not enable it for you.
An optional `STRIPE_SECRET_KEY` enables the existing analytics job selection; do
not inject unrelated API credentials into this container.

This independent proposal schedules routes present on its upstream base. When
combining it with the GitLab organization/cloud-workspace proposal, register
`/api/gitlab/jobs/reconcile-hooks` in `docker/self-host/scheduler.ts` with a
15-minute cadence and restore its scheduling tests. That route is absent from
this proposal's base, so calling it here would fail. Verify authenticated
reconciliation against the combined API before relying on automatic GitLab
webhook repair; the independent scheduler checks do not establish that flow.

The current scheduler bounds concurrency, retries failed jobs and aborts/awaits
its running fetches on shutdown. The current queue SIGTERM handler stops its
server/timer but does not abort an already-running delivery or explicitly close
the database. A delivery can run for up to fifteen minutes. This image unit does
not promise bounded graceful queue shutdown or change that implementation.
Design container stop budgets and durable retry/restore procedures accordingly;
forceful termination can lead to redelivery after the existing lease expires.

## Acceptance still required

Owned-copy import and configuration tests prove source layout, lack of runtime
defaults, command/version gates and early invalid-config refusal. They do not
build or start Docker images. Before use, verify Linux arm64 base/Bun compatibility,
non-root bind-volume permissions, actual authenticated queue publication/delivery,
scheduler route/authentication, restart persistence and signal behavior in an
isolated application fixture. A full compose, ingress policy, secret distribution,
monitoring and backup/rollback plan remain separate operator work. No cloud SDK,
job route, original queue/scheduler source or provider behavior changes here.
