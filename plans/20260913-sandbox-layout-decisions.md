# Sandbox system layout — decisions

Status: decided with Satya, 2026-09-13, in a directory-by-directory walkthrough.
Companion to `plans/20260913-sandbox-start-time.md` (boot ordering and timing) and the
Superset page "Sandbox System Layout" (the interactive tree). The reference is the
captured machine described on the sandbox anatomy page; every departure from it below
was put to Satya and settled, per the rule that we emulate first and deviate only together.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | User model | `ubuntu` with passwordless sudo (NOPASSWD); a root boot runner starts services and drops to `ubuntu` for everything else |
| 2 | Credentials | Every outbound credential is a firewall header rule the box never sees, rotated as a side effect of session extension: the API re-mints and calls `sandbox.update({networkPolicy})` inside the keepalive it already performs every 10 minutes (and on every wake) whenever a token is older than ~45 min. GitHub installation token (github.com and api.github.com, `GH_TOKEN` placeholder in env so `gh` will call), the organization's provider keys (as today), and the user's Claude OAuth access token with our API holding the refresh token. Amended 2026-09-13 from an earlier forward-endpoint variant: the endpoint would put every model token through a Vercel function (the expensive case) and the reference's askpass model exists only because it has no firewall. The Claude OAuth check closed 2026-09-14: the credential a person saves is the long-lived token `claude setup-token` mints (a year), not a short-lived access token, so it is a plain `Bearer` header rule with nothing to refresh and no forward endpoint. Rotation is a side effect of `buildSandboxClaim`: every wake and every `access` keepalive re-mints the GitHub installation token (`refresh: true`) and re-applies the whole policy |
| 3 | sudo | Unrestricted, as in the reference and Vercel's own images. Root separation is hygiene, not a wall; the firewall carries the adversarial protection |
| 4 | Package root | `/opt/superset/bundle/<sha256>/` with `current` symlink and `current.bundle-hash`; step markers and the fail-open sentinel under `/usr/local/share/superset/steps/` |
| 5 | Runtime | `/opt/superset/host/<sha256>/` with `current` and `current.version`; previous version kept for rollback |
| 6 | Secrets on disk | None. After brokering, the gate host secret is the only secret the box needs, and it arrives with Decision 15; `/etc/credstore` is not used |
| 7 | State | `/var/lib/superset/`: host.db, the bootstrap marker |
| 8 | Logs and per-boot files | `/var/log/superset/` (boot, host-service, dockerd); `/run/superset/` (pty daemon socket, host-service pid, ready flags), cleared first thing by the boot runner because a Vercel wake restores the disk and no init clears it |
| 9 | Repository hooks | `.superset/config.json` gains `start` (every boot, services) and `ports` (published through the gate) beside `setup`, `run`, `teardown`; no control-plane override (an environment column for it was built and dropped before main, 2026-09-14); a redesign of the file for cloud is a TODO. The Superset environment's start hook starts no Docker: its database is Neon, the compose stack only emulated Neon and Upstash locally |
| 10 | User environment variables | Pushed live into host-service over an RPC; new terminals and spawns inherit; claim adds, release removes key by key; nothing on disk (the reference does exactly this, credstore is for runtime secrets only) |
| 11 | Runtime user | host-service runs as `ubuntu`, started by the root boot runner, same user as the agent, terminals and desktop (confirmed from the reference's captured process tree) |
| 12 | Identity and config | `/etc/superset/sandbox.conf`, world-readable, written by the control plane at claim and rewritten on wake; read by the boot runner and host-service. The reference uses a supervisor-served identity socket, which we have no supervisor to serve |
| 13 | Assets | Manifest of hashed assets fetched from our own bucket (never usercontent) plus versioned steps; run at image build so a fresh box's markers already match; re-run at boot only when a step's version differs |
| 13a | Repository layout | `packages/sandbox/` with `bundle/{setup, assets.json, steps/, rootfs/}`; `rootfs/` mirrors the box's absolute paths so the tools manifest is derived by hashing it; `image.ts`, `build.ts`, `environments/` beside the bundle |
| 13b | Versioning | A step's version = sha256(script + the shas of its declared assets + the versions of steps it declares `after`); a `salt` field forces a re-run. host-service and Chrome are asset rows that change only when a release (host-service) or a deliberate bump (Chrome) rewrites them; the box holds one pointer, the bundle sha |
| 14 | Per-command scoped secrets | Not now; firewall plus the env push cover what we have. Revisit when host-service runs a loop of its own |
| 15 | Host secret delivery | The API runs `superset-boot` through Vercel `runCommand` with `HOST_SERVICE_SECRET` in that command's env on every create and wake; the root runner hands it to host-service's process env and nothing else; never written to disk. The secret stays: Vercel publishes ports on public URLs with no auth of their own, so it is the only thing between the internet and host-service's API (and on a laptop it stops a web page calling localhost) |
| 16 | Chrome profiles | Two, seeded identically as the reference does: `~/.config/google-chrome-visible` for the visible instance (CDP on 9222; amended 2026-09-14: Chrome 136+ refuses `--remote-debugging-port` on its default profile directory, so the visible profile cannot sit at `~/.config/google-chrome` the way the reference's did) and `~/.config/google-chrome-playwright` for automation that launches its own Chrome; not a security boundary, it exists because Chrome is single-instance per profile. Default for agent browser tooling is the visible instance over CDP so a person can see and fix a login wall; headless private runs are an opt-in for automations with no desktop |
| 17 | Wallpaper | One per workspace by its id (today), so a workspace looks the same on every wake; the reference picks at random per boot |
| 18 | Desktop stream | TigerVNC's Xvnc as the display, websockify from apt on its own port with no local auth, the gate's per-port ticket as the wall, noVNC in the pane. The reference's exact stack minus its zips (we own the image). Own process so the stream stays off the runtime's event loop and survives a host-service restart. WebRTC is out (only HTTP reaches the box); KasmVNC noted as a same-shape swap if Tight/JPEG ever proves insufficient, not a parallel implementation |
| 19 | Env push RPC | One host-service procedure that replaces the whole managed set atomically; claim and wake push the full set, release pushes empty; idempotent; new terminals and spawns inherit, open terminals unchanged |
| 20 | Contract | The zod schema shared through tRPC (identity file, env push) is the contract for the API and host-service; `build.ts` renders the handful of shell-visible constants (bundle sha, asset base, paths, ports, contract version) into `rootfs/etc/superset/contract.sh` for `superset-boot` |
| 21 | host-service fails to start | The box is kept and stopped (settled 2026-09-14): boot finishes the desktop and hooks and logs the failure; the API marks the workspace failed after its readiness wait and stops the session, so the box costs storage, not compute, until someone resumes it to look at the boot log and desktop or deletes it from the sidebar. Any other provisioning failure deletes the box |
| 22 | Release job | Holds bucket write, registry push, a Vercel token for the sandboxes project and the production database URL; writes the environment row only after the probe passes, so a failed build leaves the previous one live |
| 23 | Asset bucket | A new R2 bucket, public read, behind `cdn.superset.sh` (a wildcard on superset.sh currently answers every name; a specific record overrides it); sandbox objects under `/sandbox/<sha256><suffix>`; the firewall allowlist must include the host |
| 24 | End-to-end tests | Every PR builds the image and boots it twice in a Docker container (steps, markers, hooks, secret handoff via env; second boot skips everything); `workflow_dispatch` and the release job boot a real dev-project sandbox for wake, gate and firewall checks |
| 25 | Repositories per environment | An environment lists its repositories in order, the first being the one a workspace opens on; a workspace fixes its checkouts at create (`cloud_workspace_repositories`); a lone repository is `/workspace` itself, several sit at `/workspace/<name>` (Satya 2026-09-14, over my "always `/workspace/<name>`"); a promoted environment's repositories are fixed, since its golden was built for them (promote again to change); one GitHub installation per workspace because the firewall carries one `github.com` rule. The record is `plans/20260914-multi-repo-environments.md` |
| 26 | Config location and scope | `environments.hooks_repository_id` names whose `.superset/config.json` the box acts on (the dialog's "Config location"; none means the first repository by name); there is no per-environment hooks override (dropped 2026-09-14: its only use was the internal environment's `start`, now the monorepo's own `start` key); `environments.scope` is `organization` or `personal`, a personal row visible to its creator alone. "Start agent" saves the environment and opens a cloud workspace on it with the onboarding prompt (`ENVIRONMENT_ONBOARDING_PROMPT`) so an agent installs the project and writes its hooks |

| 27 | Boot timing | Off the workspace row (Satya 2026-09-14): the five stamp columns dropped, the desktop's timing event removed; the provision job is one Sentry transaction with a span per stage, sampled by name while the rest of the API stays untraced; checked after the production deploy, no fallback kept |
| 28 | Repository order | None stored (Satya 2026-09-14): alphabetical everywhere; the workspace opens on the config-location repository, else the first by name. Multi-repository at the root with a sidebar picker is a recorded TODO |

`/workspace` at the root stays (decided earlier: industry convention, matches the reference): the
checkout itself for one repository, the parent of one directory per repository for several
(Decision 25).
`/home/ubuntu` follows from decisions 1 and 11.

On the page but not separate calls, because they follow from the above: the `setup` runner's
subcommands; `steps.json` as the step registry (`assets`, `after`, `inputs`, `salt`); the markers and
sentinel under `/usr/local/share/superset/steps/`; `/usr/local/share/superset/media/` for staged
archives; `superset-desktop-init` as its own process beside host-service (the reference's shape);
`superset-boot status`; `/etc/profile.d/superset.sh`.

## Defaults taken without a separate decision

- Ports: host-service 4879, desktop stream 6080, both in the contract; a repo's `ports` are its own.
- Chrome pinned to the current stable at implementation time, mirrored and hashed, bumped by hand.
- P0 telemetry: millisecond stamps in `boot.log` reported on host-service's health route, a desktop
  event with create-to-ready and ready-to-first-200; a table from five creates and five reopens.
- No migration of existing sandboxes (internal only; recreated on the new image). Environment rows
  gain a bundle sha column and a hooks-override column.
- Rotation trigger: every session-extension path in the API re-mints tokens older than 45 minutes
  and calls `sandbox.update`; a wake reapplies the full policy.
- Warm pool (start-time plan P5) is sketched after P0's numbers, not now.

## Why the deviations

- **No supervisor process.** The reference's root daemon forwards an SSH agent over vsock,
  serves identity over a socket, runs the provisioner and starts the runtime with its tokens
  as arguments. Vercel gives us `runCommand` from `onCreate`/`onResume` instead. Its duties
  collapse into the boot runner (root, short-lived), a config file (identity) and the
  `runCommand` env (the host secret).
- **Runtime inside the bundle, not re-downloaded per boot.** The reference fetches its runtime
  tarball from a URL keyed by commit on every pod start, with no hash and no cache, because its
  pods are short-lived. Our sandboxes persist for a month, so an update must be cached and
  verified; the runtime becomes one more hashed asset with an install step, and a release
  rewrites its manifest row. The API must tolerate a box on the previous bundle for the length
  of one wake.
- **Derived step versions.** The reference hand-maintains step versions in its control plane
  and passes them as arguments; bumping an archive touches three places. It already hashes its
  apt list's contents as that step's version; we generalise that.
- **`/var/log` instead of `/tmp` for the boot log**, and `/run` for per-boot files: the FHS
  places, chosen because a wake restores the disk.

## Facts established on the way

- Every credential the box holds today, sorted: outbound credentials (git token, provider
  keys, OAuth token) are brokerable; the gate host secret is inbound and must stay on the box;
  identity and config are not secret; the user's own project variables cannot be brokered
  generically. The API session token is already a placeholder in sandbox mode.
- `/proc/<pid>/environ` is owner-readable; only a different uid hides it, and passwordless
  sudo defeats that too. Both references accept this: eve puts nothing in the box's env; the
  reference keeps the store behind root and strips token variables from user shells.
- Chrome runs with `--no-sandbox` on the reference even as `ubuntu`; the flag is not a
  consequence of root.
- Reinstalling Chrome's deb overwrites `google-chrome.desktop`, so the configure step must
  re-run after an install step: the `after` dependency in the manifest exists for this.
- A firewall-brokered domain is TLS-terminated by a per-sandbox proxy CA the host trusts and
  containers do not; a container that talks to a brokered domain needs the CA mounted.

## Still open

- ~~Contract names shared by the API, host-service and the shell-side boot runner~~ done:
  `build.ts` renders `contract.sh` from `@superset/shared/sandbox-contract` (Decision 20).
- The identity stays a file the API writes before boot (Decision 12 as written). A variant that put it in the
  boot command's env saved one provider call (~0.3 s); Satya chose the file on 2026-09-14: a file on the box
  is legible, has no size ceiling, and the runner's inputs keep one shape. The box receives only the `start`
  and `ports` hook overrides; `setup` is the release's.
- The `start` hook is sequenced by the boot runner and executed by host-service (settled with
  Satya 2026-09-14): the environment the hook needs is pushed into host-service and never
  leaves it, so host-service spawns; the runner decides when (host-service up, push landed,
  checkout in) through `sandbox.runStartHook`, so every boot-time action reads in `boot.log`.
  Once per boot, marker in `/run/superset`.
- Repository `ports` are read from the hooks repository's `.superset/config.json` at create (GitHub contents API, the
  installation token) and published on the sandbox; the access mint still issues tickets for
  the two platform ports only. A ticket per repo port waits for a pane that uses one.
- ~~Verify the Claude OAuth access-token lifetime~~ closed: the stored credential is the
  long-lived `claude setup-token` token; nothing to refresh (Decision 2).
- Per-variable brokering ("send this variable to domain X") for the user's project env, later.

## Next

Implementation lands as separate PRs in this order: the P0 measurement from the start-time
plan; the `packages/sandbox` move with the bundle runner, rootfs overlay and derived versions;
the boot runner (host-service first, `/run` cleared, hooks); the credential brokering extension
and the env push; the release pipeline change that writes the host-service row. The image
rebuild and `sandbox:release` against production wait for Satya's go.
