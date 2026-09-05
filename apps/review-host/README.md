# App Store review host

A single always-on Fly machine that exists so **Apple's reviewer sees a working
app**. It is not a tester box and not a customer demo.

The mobile app fans every screen out to *online hosts*. The review account has no
Mac, so without this machine the reviewer signs in and gets "No projects on an
online host" — an empty app, and a rejection. This box is the host.

| | |
| --- | --- |
| Fly app | `superset-review-host` (org `superset-670`, region `sjc`) |
| Superset org | `9617bc8e-7f57-4af8-8b5e-586290ae536a` — "App Review" |
| Review account | `appreview@superset.sh` (password lives in App Store Connect, nowhere else) |
| Machine name | `acme-devbox` — what the reviewer sees, set by `hostname` in the entrypoint |
| Projects | `acme`, `acme-ios` — baked into the image from `demo/` |

## Deploying

```bash
apps/review-host/scripts/deploy.sh
```

`SUPERSET_API_KEY` and `ANTHROPIC_API_KEY` are already set as Fly secrets and are
not in this repo. The `review_host_data` volume carries the OAuth session
(`config.json`), `host.db` and the reviewer's worktrees, so it must survive
deploys — the reviewer's app should match the App Store screenshots.

## The rootfs resets on every restart

**Nothing outside `/root/.superset` survives.** Restart the machine and the whole
filesystem reverts to the image — including `/root/superset`, where host-service
lives.

This was learned the expensive way: updating host-service in place on the running
box appeared to work, and silently reverted on the next boot. So `SUPERSET_VERSION`
in the `Dockerfile` is the *only* version that exists. There is no hotfix path;
every change is a rebuild.

It also means the box cannot drift on its own — but it can never self-heal either.
A Fly host migration (one happened 2026-09-02) puts it straight back on whatever
the image says.

## Bump it with every release

The box has no auto-update, and nothing bumps `SUPERSET_VERSION` on its own.

This has already cost a review cycle. The image was built 2026-08-14 on
host-service **1.22.0** and stayed there while the app shipped 1.26.0. Seven
procedures the mobile app calls did not exist on it:

- `github.getPullRequestDetail` (1.23.0)
- `github.markPullRequestReady`, `github.updatePullRequestBranch`,
  `github.reopenPullRequest`, `github.dequeuePullRequest` (1.25.0)
- `pullRequests.historyByWorkspaces` (1.25.0)
- `agentTooling.listSlashCommands` (1.25.0)

Every one 404s at runtime with no upgrade prompt, because
`MIN_HOST_SERVICE_VERSION` (`packages/shared/src/host-version.ts`) is `1.21.0` and
1.22.0 clears it. The floor is deliberately narrow — it is for wire-contract
breaks that render the app blank, not optional features — so it is *not* the thing
to raise here. Rebuilding this image is.

## Why there is no Fly health check

host-service binds `127.0.0.1` only (verified on 1.26.0; 1.22.0 bound `0.0.0.0`,
which is why the old TCP check on 48800 passed and then went permanently critical
after the upgrade). Nothing reaches it over Fly's network — the relay tunnel dials
it from inside the machine — so there is no address for a check to connect to.

Liveness is the entrypoint's watchdog instead, and it asks a better question:
does the relay's `/presence` say this host is routable? That is the same authority
`host.list` reads to decide "online", so it matches what the reviewer's phone sees.

The watchdog it replaced curled `/trpc/health.check` and trusted the HTTP status,
which could never work: that procedure returns 200 unconditionally, and the
`cloudRegistered` flag in its body is written once at boot
(`packages/host-service/src/tunnel/connect.ts`) and never updated. It only ever
caught a fully dead HTTP server — the one case Fly already handles.

## Checking on it without deploying

```bash
fly ssh console -a superset-review-host -C \
  "curl -sf -H 'Authorization: Bearer review-host-watchdog' http://127.0.0.1:48800/trpc/host.info"
```

`version` in that response is the number that must not fall behind what the app
calls. `review-host-watchdog` is the local `HOST_SERVICE_SECRET`; it only grants
access over loopback inside the machine.
