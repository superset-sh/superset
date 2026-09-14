# The sandbox package

Everything that produces a cloud workspace sandbox: the image, the bundle a
box installs and updates itself from, the assets the bundle fetches by hash,
and the release scripts that build goldens. The decisions behind the layout
are in `plans/20260913-sandbox-layout-decisions.md`; the build and test
checklist is `plans/20260913-sandbox-implementation-checklist.md`.

## Where a new thing goes

- **A file that lands on the box** goes under `bundle/rootfs/` at its
  absolute path. `/etc/sudoers.d/ubuntu` on the box is
  `bundle/rootfs/etc/sudoers.d/ubuntu` here. The install manifest is derived
  by hashing that tree, so there is nothing else to edit.
- **A file too big or too foreign for git** (a deb, a font, a theme tarball,
  the host-service runtime) is a row in `bundle/assets.json`, produced by
  `bun run assets <name>` and fetched on the box by sha256 from
  `cdn.superset.sh/sandbox/`. The row's `dest` is where it lands; archives
  are staged under `/usr/local/share/superset/media/` for a step to consume.
- **Something the box has to execute to configure itself** is a step:
  `bundle/steps/<name>.sh`, registered in `bundle/steps.json` with the assets
  it consumes, the rootfs files it reads (`inputs`) and the steps it must
  follow (`after`). Its version is derived from all of those, so it re-runs
  on every box exactly when one of them changes.
- **Anything the box never sees** (the image build, the release scripts)
  stays under `src/`.

The rule of thumb: if you can answer "where is it on the box", put it there.

## What runs when

| When | What |
| --- | --- |
| `bun run build` | Hashes `bundle/`, renders `contract.sh` from `@superset/shared/sandbox-contract`, derives the step versions, writes `dist/bundle/<sha>/` and the tarball. Deterministic: the same tree is the same sha on any machine. |
| `bun run build --publish` | Also uploads the bundle and any asset the bucket lacks. Refuses to publish a bundle that references an asset the bucket does not have. |
| `bun run image` | Builds the image: OS, apt lists, vendor tools, the `ubuntu` user, then installs the bundle at its sha and runs every pass once, so a fresh box finds every hash sidecar and step marker matching. `--local` builds `superset-sandbox:local` for the boot-twice test; `--dry` prints the Dockerfile. |
| boot (`superset-boot`) | On the box, as root, run by the control plane on every create and wake, after it has written `sandbox.conf`, with the host secret in its env: clears `/run/superset`, installs the pinned bundle if the hash differs, runs the three passes (each a hash compare), starts host-service as `ubuntu` with the secret from the boot env, then the desktop and the checkout. Once host-service answers, the environment has been pushed and the checkout is in, the runner asks host-service to run the repo's `start` hook with that environment. |
| `bun run release` | Rewrites the host-service asset from this checkout, publishes the bundle, pushes the image (unless `--skip-image`), builds the internal golden with the environment's `setup` hook, probes a fork of it (`src/environments/probe.ts`) including a stop and wake, and writes the environment rows only after the probe passes. |
| `bun run src/real-sandbox.ts` | The `workflow_dispatch` job: one real dev sandbox from the registry image on this checkout's bundle, the same probe, a stop and a wake. |

An asset URL is content-addressed, so the CDN caches it for hours — including a 404. An image
build that runs before the publish that uploads the asset poisons the edge it used for four
hours; the runner's fetch retries with a cache-busting query when the plain URL 404s, and CI
publishes before it builds. Locally: publish first.

A staged archive under the media directory that the current manifest does not name is an
earlier build's; `sync-assets` prunes it before fetching, and a step that needs its asset
picks it by the manifest's hash rather than by listing the directory.

## Versioning

- A rootfs file: its sha256, compared to the `.hash` sidecar beside it on the box.
- An asset: its sha256, same sidecar rule; it is also the object's name in the bucket.
- A step: `sha256(script + declared asset shas + declared input hashes + versions of steps it follows + salt)`.
- The bundle: the sha256 of its tarball; the one pointer the box holds, written into `/etc/superset/sandbox.conf` by the control plane.
- host-service and Chrome are asset rows that move only when a release or a deliberate `bun run assets` rewrites them; a merge to main changes nothing on any box.

## The runner in the image runs first

`superset-boot` is a rootfs file, so a bundle carries the newest runner and
`apply-rootfs` installs it; but the runner that handles a boot is the one
already on the box, and it fetches the bundle only after it has read its
own inputs. A change to how the control plane hands the runner its inputs
(the identity file, the secret in `HOST_SERVICE_SECRET`) therefore reaches
a box that has booted at least once on a bundle carrying the new runner,
and a fresh box only through the image. `bun run release` pushes the image for that reason; `--skip-image`
is for a release that changes nothing under `rootfs/usr/local/bin/`.

## Tests

`bun test` covers the manifest math. The runner and steps are exercised by
building the image locally (`bun run image --local`) and booting it twice
(`src/boot-twice.test.ts`): the second boot must install nothing, fetch
nothing and skip every step.
