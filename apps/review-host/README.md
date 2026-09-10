# App Store review host

The always-on host Apple's reviewer signs into. A persistent GCP VM since
2026-09-05; the Fly deployment it replaced is destroyed.

| | |
| --- | --- |
| Instance | `superset-review-host`, zone `us-west1-b`, project `fair-scout-481221-v0` ("Superset") |
| Shape | `e2-standard-4` — 4 vCPU, 16 GB, 50 GB pd-balanced, deletion protection on |
| Superset org | `9617bc8e-7f57-4af8-8b5e-586290ae536a` — "App Review" |
| Account | `appreview@superset.sh` (password lives in App Store Connect, nowhere else) |
| Machine name | `acme-devbox` — what the reviewer sees |

## Why it moved off Fly

Fly machines reset their rootfs to the image on every restart. Only the volume
survived, so a host-service update applied to the running box looked like it
worked and silently reverted on the next boot — and a Fly host migration (one
happened 2026-09-02) did the same. The box was stuck on 1.22.0 for three weeks
that way, 404ing on seven procedures the mobile app calls.

Here `/opt/superset` and `/root/.superset` are both on the boot disk. A reboot
keeps them, so `update.sh` is a real update path. Verified by hard-resetting the
instance: it came back on its own, same identity, same version, same data.

## Host identity is the empty string, and that is load-bearing

`getHostId()` is `HMAC-SHA256("superset-desktop-device-id-v1", <contents of
/etc/machine-id>)` truncated to 32 chars. On the Fly image that file was **empty**
— the ubuntu base never populates it and nothing there runs systemd — so this
host's id is the HMAC of the empty string:

```
a5b47dedad57a63d234ffff6753c74df
```

Reproducing it on a real VM needs an empty `/etc/machine-id`, but systemd treats
an empty one as first boot and repopulates it — which would change the id on the
next reboot and register a *second* host the reviewer sees as a duplicate. So the
OS keeps a real machine-id and only host-service is shown an empty one, through
`BindReadOnlyPaths=/opt/review-host/machine-id:/etc/machine-id` in the unit.

That is why the migration was a takeover rather than a new host: same id, same
`v2_hosts` row, no picker for the reviewer.

Worth knowing more generally: **any Linux host with an empty `/etc/machine-id`
derives this same id.** Containers without systemd are the common case. Two of
them registering against one organization would collide.

## Operating it

```bash
# state
gcloud compute ssh superset-review-host --zone=us-west1-b --command \
  'sudo curl -sf -H "Authorization: Bearer review-host-watchdog" http://127.0.0.1:48800/trpc/host.info'

# bump host-service (persists across reboots, rolls back if it fails to return)
gcloud compute ssh superset-review-host --zone=us-west1-b --command \
  'sudo SUPERSET_VERSION=1.27.0 bash /opt/review-host/update.sh'

# re-provision from scratch (idempotent)
sudo REVIEW_ORG_ID=9617bc8e-7f57-4af8-8b5e-586290ae536a bash /opt/review-host/setup.sh
```

`START_SERVICES=0` provisions without starting, which is how to stand up a
replacement before retiring the current one — two machines resolving to the same
hostId would evict each other's relay tunnel in a loop.

## Staying current

`SUPERSET_VERSION` in `setup.sh` is only the floor a fresh VM starts from. One
thing keeps the box current after that: **`self-update.sh`**, on a 30-minute
systemd timer (`superset-review-update.timer`). It reads the latest `desktop-v*`
release — the `cli-v*` tags are prereleases that `/releases/latest` never returns
— and hands to `update.sh`.

It only moves forward, `update.sh` rolls back unless the new build answers *and*
the relay can see it, and `setup.sh` refuses to reinstall an older pin over a
newer installed build. The reason for all of that is that this box went 21 days
stale unnoticed, which is what the outside-in `check.sh` now also watches for.

**An earlier version of this file said a `release.published` automation was the
primary path and the timer only a backstop. No such automation exists, and one
cannot be built the obvious way.** A GitHub App installation maps to exactly one
organization (`apps/api/src/app/api/github/webhook/route.ts`), and
`superset-sh/superset` is installed under Superset, so the release event only ever
lands there — while an automation can only target a host registered in *its own*
organization (`packages/trpc/src/router/automation/automation.ts`), and this box
lives in App Review. So an automation in App Review can never fire, and one in
Superset can never reach this box; it would have to run on someone's laptop and
`gcloud ssh` in, which is the dependency that already failed on 2026-09-06 when
that laptop's gcloud refresh token expired. Hence 30 minutes: at 6h the window
where the box ran a release behind was wide enough to hit by accident, and did on
2026-09-09.

## The GitHub token expires 2026-10-05

The pull-request chip is the reviewer's **only** route to the diff — every
navigation to `files-changed` comes from `PullRequestScreen` — and the listing
promises diff review, so an expired token silently removes the headline feature.

`ctx.github()` throws `NO_GITHUB_TOKEN` rather than falling back to
unauthenticated, so a token is required even though `acme-demo` is public. It
lives in `/etc/superset-review-host.env` (`0600`, root) and the unit reads it via
`EnvironmentFile=-`, so it stays out of world-readable unit files, out of
`gh auth login`, and out of the demo worktrees.

To rotate: create a fine-grained PAT with **Public repositories (read-only)** and
no account permissions, then

```bash
read -rs GH_TOKEN                       # paste the token; it never reaches the terminal
printf 'GH_TOKEN=%s\n' "$GH_TOKEN" | gcloud compute ssh superset-review-host --zone=us-west1-b --command \
  'sudo sh -c "cat > /etc/superset-review-host.env; chmod 600 /etc/superset-review-host.env; systemctl restart superset-review-host"'
unset GH_TOKEN
```

The token goes over stdin, not in the command line: an argument would land in your
shell history locally and in `ps` output and the auth logs on the box.

`check.sh` calls the API with it every run, so expiry surfaces as a FAIL rather
than as a chip that quietly stops appearing.

## The watchdog also owns the resident session

Any restart takes the resident Claude session with it — an `update.sh` bump, the
watchdog's own restart, a reboot — and until 2026-09-09 nothing put it back. That
is worse than it sounds: the pull-request chip renders only while a terminal is
open, so a box with no session shows the reviewer no pull request anywhere, and
`check.sh` runs too rarely to catch the gap. `watchdog.sh` now asserts the session
every pass and calls `agents.run` when it is genuinely absent; a probe that cannot
answer does nothing, because reading it as "absent" would spawn the duplicate
sessions `check.sh` fails on.

It also pre-answers Claude Code's custom-API-key prompt. The key reaches the agent
from `host_agent_configs.env_json`, and Claude Code asks once per key and
remembers the answer as the key's last 20 characters in `customApiKeyResponses`
in `/root/.claude.json` — so rotating the key left every new session parked on
`Do you want to use this API key?` with `check.sh` green throughout, since it
counts sessions rather than reading the screen. The watchdog seeds that approval
from the key already in the host database, records only a hash of the suffix in
`/opt/review-host/.approved-key`, and relaunches the session once per key so it
is never left sitting on the prompt. Nothing about the key is written to this
repo. Worth knowing: while a session sits on that prompt the agent's launch line
is still on screen, and it carries the key in plain text — `envOverlayPrefix`
prepends the agent's env to the command string, so the reviewer's first tap used
to show it.

## Why there is no health check on the port

host-service binds `127.0.0.1` only (1.26.0; 1.22.0 bound `0.0.0.0`). Nothing
reaches it from outside — the relay tunnel dials it from inside the machine.
Liveness is `watchdog.sh`, which asks the relay's `/presence` whether this host
is routable: the same authority `host.list` reads, so it matches what the
reviewer's phone sees. It restarts the unit after 5 minutes of invisibility, and
starts 120s late because presence lags a cold boot by ~20s.
