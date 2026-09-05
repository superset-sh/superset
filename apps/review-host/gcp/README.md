# App Store review host — GCP (canonical)

The always-on host Apple's reviewer signs into. This replaced the Fly deployment
on 2026-09-05; the Fly files alongside this directory are kept only as rollback
and should be deleted once you're confident.

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

## Bump it with every release

Nothing does this automatically yet. `setup.sh`'s `SUPERSET_VERSION` and whatever
`update.sh` last installed are the only record of what is running. The whole
reason this box matters is that it went 21 days stale unnoticed — a scheduled
check that compares the running version against the latest `cli-v*` release is
the actual fix, and it is still owed.

## Why there is no health check on the port

host-service binds `127.0.0.1` only (1.26.0; 1.22.0 bound `0.0.0.0`). Nothing
reaches it from outside — the relay tunnel dials it from inside the machine.
Liveness is `watchdog.sh`, which asks the relay's `/presence` whether this host
is routable: the same authority `host.list` reads, so it matches what the
reviewer's phone sees. It restarts the unit after 5 minutes of invisibility, and
starts 120s late because presence lags a cold boot by ~20s.
