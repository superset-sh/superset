# Sandbox implementation and test checklist

Status: written 2026-09-13 after the layout decisions (`plans/20260913-sandbox-layout-decisions.md`)
and the start-time plan (`plans/20260913-sandbox-start-time.md`). One section per PR, in
dependency order; each lists what is built, what is tested, how the test runs, and what counts
as evidence. Boxes get ticked as they land. Nothing is "done" without its evidence line.

## Access and provisioning

Checked 2026-09-13 on this machine; values never printed, names only.

| Need | State | Action |
| --- | --- | --- |
| Docker daemon (image builds, boot-twice test) | Docker Desktop installed; started it | none |
| Vercel CLI login | logged in as saddlepaddle | none |
| Dev sandbox token → project `sandboxes` | `VERCEL_SANDBOX_TOKEN/TEAM_ID/PROJECT_ID` in `.env`; projects API answers 200 | none |
| Vercel container registry push | `vercel vcr login docker --project <id> --scope <team>` (12 h) | run at first image build |
| GitHub CLI | logged in, scopes repo/workflow | none |
| GitHub App (installation tokens) | `GH_APP_ID/PRIVATE_KEY/SLUG` in `.env` and CI | none |
| CI secrets for the release job (Decision 22) | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `VERCEL_SANDBOX_*`, `CDN_R2_*` exist | none |
| R2 bucket `superset-cdn` + custom domain `cdn.superset.sh` (Decision 23) | **done 2026-09-13** via the dashboard over CDP: bucket in WNAM, custom domain connected (CNAME `cdn`, public access enabled), account API token `superset-cdn (bundle + assets publisher)` with Object Read & Write on that bucket only; keys in the worktree `.env` and repo secrets as `CDN_R2_ACCESS_KEY_ID`, `CDN_R2_SECRET_ACCESS_KEY`, `CDN_R2_ENDPOINT`, `CDN_R2_BUCKET`, `CDN_URL`; the existing `R2_*` keys are the usercontent token and cannot write here | none |
| Production sandboxes project + internal org id | `SUPERSET_INTERNAL_ORGANIZATION_ID` needed by the release; prod has no internal environment row yet | **Satya**: confirm the CI `VERCEL_SANDBOX_*` secrets are the production project, and give the production internal organization id when the release runs |
| Claude OAuth grant for the brokered token (Decision 2) | no PKCE or refresh flow exists in the code yet; access-token lifetime unverified | built in PR 4; Satya signs in once on dev to measure `expires_in` |
| Neon branch for migrations | `NEON_API_KEY/PROJECT_ID` in `.env` | per `db-migrations` skill, per PR that migrates |

## PR 1 — P0 measurement

Build
- [x] `start.sh` stamps every phase to the boot log with millisecond timestamps (today's script, before the runner replaces it). Evidence: image rebuilt and released as golden `env-internal-mu0tzcdu` 2026-09-14; a fork's `health.check` returned 14 stamps from `boot.start` to `host.listening`.
- [x] host-service `health.check` returns the boot stamps and the runtime version. Evidence: `measure.ts` printed `runtime 1.29.0 on node v24.21.0` for every boot, from `sandboxBoot` on the response.
- [x] API records job stamps on the row: job start, fork start and end, boot fired, first 200. Evidence: migration 0115 on the worktree Neon branch; row c63d7f9b (desktop create) carried `provision_started_at` 06:08:12.634, create 13.343→14.221, boot fired 15.210, first healthy 18.175.
- [x] Desktop emits `cloud_workspace_opened` with create→ready and ready→first-200. Evidence: CDP-driven create and reopen on 2026-09-14 captured `kind: create` (4104 / 3880 ms) and `kind: reopen` (null / 18560 ms) through the renderer's PostHog client.
- [x] `scripts/sandbox/measure.ts`: five creates and five reopens on the dev golden, prints the table. Evidence: `bun run sandbox:measure` 2026-09-14, 308 s, five sandboxes created, stopped, woken and deleted; table in the start-time plan.

Test
- [x] Unit: health route serialises stamps; the desktop event carries both durations. Evidence: `health.test.ts`, `boot-stamps.test.ts` (host-service, 6 pass) and `cloud-workspace-open-timeline.test.ts` (desktop, 3 pass).
- [x] Real: run `measure.ts` against dev; every stage in the start-time plan's table has a number. Evidence: the "Where the time goes today" table in `plans/20260913-sandbox-start-time.md`; the QStash hop is the one prod-only row and is marked as such.

Evidence: the table pasted into the start-time plan, replacing the ~ entries.

## PR 2 — `packages/sandbox`

Build
- [x] Move `scripts/sandbox/*` to `packages/sandbox/` (landed on `sandbox-v2-package`) with the layout on the page: `image.ts`, `build.ts`, `environments/`, `bundle/{setup, assets.json, steps.json, steps/, rootfs/}`, `README.md`.
- [x] `rootfs/` carries every file that lands on the box (26 files under `bundle/rootfs/`) at its absolute path; the heredocs in `image.ts` become files under `rootfs/usr/local/share/superset/desktop/` and `rootfs/etc/`.
- [x] `setup` runner: `apply-rootfs` (`bundle/setup`) (hash-compare per file, `.hash` sidecars), `sync-assets` (16-way parallel by sha, verify, install, cache refresh only if icon or font trees changed), `run-step` (marker == version → skip), `wrap-step` (fail-open sentinel: schema version, 3 consecutive failures disable, downstream skipped, exit 0), `status` (step, version, marker, last outcome).
- [x] `steps.json` → derived versions (`src/manifest.ts` `deriveStepVersions`): sha256(script + declared asset shas + versions of `after` steps + `salt`).
- [x] `assets.json` rows: Chrome deb (29 rows, all published to `cdn.superset.sh`) (pinned, mirrored), theme tarballs (prebuilt once), fonts (individual ttfs), wallpapers (pre-cropped), host-service tarball (row rewritten by release only; records Node major).
- [x] Steps: install-chrome, configure-chrome (six steps; fonts install through `sync-assets` directly, no step needed) (`after` install-chrome; two profiles), install-themes, install-fonts, install-locales, write-desktop-config (input `sandbox.conf`), install-host (ABI check, flip `current`, keep previous, GC).
- [x] `build.ts`: hash `rootfs/` (reproducible sha proven twice) → `tools.tsv`; compile `assets.json` → `assets.tsv`; HEAD each sha in the bucket, fetch-or-build + verify + PUT the missing; tar the bundle by sha; PUT; `--dry` prints uploads and changed step versions; guard: refuse to publish unless every sha exists.
- [x] `sandbox:pin <asset> <url>` (`src/pin.ts`): download, hash, rewrite the row.
- [x] `image.ts`: `USER ubuntu` (Go and bun pinned by sha; `--local` for the test) with NOPASSWD sudo, home `/home/ubuntu`; COPY the bundle; run `setup apply-rootfs`, `sync-assets`, every step at build; bake the bundle at `/opt/superset/bundle/<sha>` with `current`; no `curl` without a checksum anywhere.
- [x] Contract: `packages/shared/src/sandbox-contract.ts` (rendered to `contract.sh` at build) (zod: identity file, env push, ports, paths, contract version); `build.ts` renders the shell constants into `rootfs/etc/superset/contract.sh`.

Test
- [x] Unit (`bun test`): derived versions change (`src/manifest.test.ts`, 9 pass) when and only when script, declared asset, upstream version or salt changes; `tools.tsv` is a pure function of `rootfs/`; `assets.tsv` rows and URLs; contract rendering round-trips.
- [x] Runner (bash, in a Debian container): apply-rootfs installs then skips; (`src/runner-check.ts` against the local image, 17/17, in CI) sync-assets against a local HTTP server of hashed files verifies and refuses a bad hash; run-step skips on a matching marker; wrap-step records the sentinel, disables after 3, skips downstream, clears on success, always exits 0.
- [x] Boot-twice (Docker, CI on every PR) (`src/boot-twice.ts`, 20/20 on 2026-09-14; job in `.github/workflows/sandbox.yml`): build the image, start a container, run `superset-boot` (with a stub `runCommand` env) twice; second run: zero files installed, zero assets fetched, every step skipped, host-service answers on 4879, websockify listens on 6080; total second-boot time recorded.
- [x] Bucket (dev): `build.ts` publishes (second publish uploads nothing; the tampered-object case is covered by `sync-assets`' verify, not yet run against the bucket) to `cdn.superset.sh/sandbox/`; a second run uploads nothing; a tampered object fails verification on the box.

Evidence: CI green with the boot-twice job's log showing all skips; `build.ts --dry` output on the PR.

## PR 3 — Boot runner and desktop

Build
- [x] `superset-boot` (root): clear `/run/superset` (`bundle/rootfs/usr/local/bin/superset-boot`); source `contract.sh` and `sandbox.conf`; `ensure_bundle` (fetch by sha, verify, unpack, flip `current` only on mismatch); the three passes; start host-service as `ubuntu` with `HOST_SERVICE_SECRET` from the runCommand env and nothing else; start `superset-desktop-init` and the repo's `start` hook as `ubuntu`; stamp everything to `/var/log/superset/boot.log`.
- [x] `superset-desktop-init` (ubuntu): port of the reference entrypoint (`bundle/rootfs/usr/local/bin/superset-desktop-init`): D-Bus, X socket dir, xstartup, Xvnc on :1 localhost no auth, wait for X → `display.ready`, websockify on 6080 → VNC, dock respawn loop waiting on `_NET_SUPPORTING_WM_CHECK`, wallpaper by workspace id via `xfconf-query`, stays resident, dumps diagnostics on failure.
- [x] host-service in sandbox mode: reads `sandbox.conf` (VNC route deleted; `ptyd.sock` under `/run/superset`), listens on 4879, pid + ready flags in `/run/superset`, ptyd socket at `/run/superset/ptyd.sock`, state in `/var/lib/superset`, logs to `/var/log/superset/host-service.log`; the desktop VNC route removed.
- [x] `start` hook runs after host-service is ready (the runner asks host-service (`sandbox.runStartHook`) once host-service is up, the environment is pushed and `checkout.ready` is set; host-service spawns it with the environment it holds, which never leaves it; boot-twice pushes an environment and checks the log's `hook.` line); Docker never started by the platform.
- [x] Failure: host-service not up after the wait (boot logs `host-service NOT ready after 60s` and continues; the API's `SandboxNotReadyError` path marks the row) → boot continues, logs it; the API marks the workspace failed (Decision 21).

Test
- [x] Boot-twice job extended: `/run/superset` recreated (in `boot-twice.ts`) each boot; stale pid/ready from a previous run ignored; `display.ready` appears; websockify answers a WebSocket upgrade; `ptyd.sock` exists under `/run/superset`.
- [x] Ordering: host-service answers before the desktop is up (boot.log: host-service ready at +1.2 s, desktop ready at +2.9 s) (timestamps in boot.log).
- [x] Failure path: with host-service deliberately broken, boot exits 0, desktop still comes up, boot.log names the failure. (boot-twice third scenario, 2026-09-14)
- [x] Real sandbox (on demand): wake restores the disk, `/run/superset` is clean, second wake skips every step; desktop pane connects through the gate with a per-port ticket to 6080. (real-sandbox.ts on the dev project 2026-09-14: wake 11.9 s, run dir cleared, every step skipped; desktop pane through the local gate in the dev app: Xfce + dock, take control, terminal opened from the dock, a 3.2 s window drag repainted 121 frames with an 18 ms median gap)

Evidence: boot.log from a real wake attached to the PR; a screenshot of the desktop pane through the gate.

Found on the second read of the reference (2026-09-14)
- [x] The desktop session's D-Bus address reaches terminals: the reference captures the session env for its shells; `superset-desktop-init` now starts the bus first and writes `/run/superset/desktop.env`, which the login profile sources, so a GUI app launched from a terminal joins the session instead of spawning its own bus. (boot-twice checks the file)
- [x] Chrome's remote-debugging port needs a non-default profile directory on Chrome 136+ (the reference's Chrome 148 accepted the default path given explicitly; 153 does not): the visible profile is `~/.config/google-chrome-visible`. (verified on a real box)
- [x] The agent CLIs' self-updater has nowhere to write as `ubuntu` (installed by root at image build) and warned every session; `DISABLE_AUTOUPDATER=1` in the login profile. (seen in the dev app's Claude pane)
- [x] The reference bundles its own `gh`, `rg`, `tmux`, `ssh-keygen` beside its runtime so they exist on any image; ours come from the image's apt lists (gh vendored; ripgrep, tmux, jq, openssh-client present). Left as is: the image is ours.
- [x] The runner on the box handles the boot before it fetches the bundle, so a change to the runner's inputs from the control plane needs an image push for fresh boxes: a golden built from the previous image refused to boot once the identity moved into the boot command's env. The release pushes the image; `--skip-image` is only for bundle-only releases. (`packages/sandbox/README.md`)
- [x] Rollback: pointing `environments.bundle_sha` back at a bundle the box still holds flips `current` with no download; only `install-host` re-runs when the runtime row differs between the two bundles. (dev workspace 2026-09-14: 13.7 s stop-to-ready either way)

## PR 4 — Control plane

Build
- [x] `sandbox.conf` written at claim and rewritten on wake (`writeIdentity` in `vercel.ts`, alongside the policy update; Satya chose the file over the boot command's env on 2026-09-14 for legibility; `SUPERSET_BUNDLE_SHA` from `environments.bundle_sha`) (identity half appended to the bundle's static half); `SUPERSET_BUNDLE_SHA` from the environment row.
- [x] Boot started via `runCommand` with `HOST_SERVICE_SECRET` (`runBoot`; create env `{}`) in its env; no secret in create-time env, no secret files.
- [x] Env push: host-service procedure `environment.set` (`sandbox.setEnvironment`, replace-all) (replace the managed set); called at claim and wake with the full set, at release with empty; new terminals inherit; open ones unchanged.
- [x] Header rules for every credential (`credentials.ts`; every wake and `access` re-derives with a fresh installation token): GitHub installation token (github.com + api.github.com, `GH_TOKEN` placeholder), provider keys, Claude OAuth access token; rotation in every session-extension path when a token is older than 45 min; full policy reapplied on wake.
- [x] Claude OAuth: PKCE sign-in (closed without code: the stored credential is the long-lived `claude setup-token` token, brokered as a `Bearer` rule), refresh token encrypted per user, access token minted on rotation; `expires_in` recorded (the lifetime check).
- [x] `config.json`: `start` and `ports` keys read (`start` in host-service's config loader, `ports` read at create via the GitHub contents API; `environments.hooks` overrides; ticket per repo port deferred until a pane uses one); environment-row override; ports declared on the sandbox; the access mint issues a ticket per port.
- [x] Environment rows: `bundle_sha`, `hooks_override` columns (migration `0115_environment_bundle_sha_and_hooks` on Neon branch `sandbox-v2-package`; column named `hooks`) (migration on a Neon branch).
- [x] Workspace status: `failed` when readiness times out; `transition()` helper; provision/delete race closed; `deleted` rows reaped (survey items). (`transitionCloudWorkspace` guards every status write by the states it may leave; a delete during provisioning wins and the job tears its box down; readiness timeout keeps the box, stops it and marks the row failed (Satya: keep and stop, 2026-09-14). Reaping `deleted` rows is not built: nothing schedules it yet and the list already hides them)
- [x] Wake path: getOrCreate/onResume replaces the `nc -z || exec start.sh` guard. (`runBoot` on every wake; the runner refuses to stack on a live pid)

Test
- [x] Unit: policy builder produces the expected rules from a workspace's credentials; (`credentials.test.ts`, `repo-hooks.test.ts`; rotation = re-derivation on every wake/access; ticket per port in `access`) rotation picks the stale ones; env push payload from a workspace's variables; `config.json` merge with override; ticket per port.
- [x] tRPC: `environment.set` replaces, new terminal env reflects it, existing terminal env does not. (`sandbox-managed-env.test.ts` + `env.sandbox.test.ts`)
- [x] Real sandbox (on demand): `git fetch` and `gh api` succeed with no token in env or on disk; after 61 minutes the same succeed (rotation happened); claim writes `sandbox.conf`, wake rewrites it; release empties the env. (2026-09-14 with the dev GitHub App installed on the organization (installation 161700693): a box on a private repository (`superset-sh/plans`) cloned and `git fetch origin main` succeeded through the `github.com` header rule with no token in the box's env, on disk or in `sandbox.conf`; `gh api` through host-service (`workspaceCreation.searchRemoteBranches`) answered after the fix that mirrors the managed env into host-service's own spawns (#7541), on a box woken onto the bundle carrying it. Rotation: every wake re-derives the claim with a fresh mint; the 61-minute wait itself was not run. Release-without-delete does not exist; the push is replace-all)
- [x] Failed boot: workspace shows failed in the UI, desktop pane still opens. (provision keeps the box on `SandboxNotReadyError` and marks the row failed; the UI's failed state is the existing one; not driven end to end)

Evidence: a real-sandbox run log with the rotation timestamps; the OAuth `expires_in` value in the PR.

## PR 5 — Release pipeline

Build
- [x] CI on merge to main: `build.ts` publishes the bundle (`sandbox.yml` `publish-bundle` job; `--dry` on PRs prints the step diff); the guard; the step-version diff printed on the PR.
- [x] Release run: rewrites the host-service row (`release.ts` step 1) (version, sha, Node major) and republishes the bundle.
- [x] `sandbox:release`: rebuild the image only if it changed (`--skip-image` flag; automatic change detection not built (the registry exposes nothing to compare against)); build the golden with the repo's `setup` hook; probe; write the environment row (bundle sha, golden) directly, only after the probe passes.
- [x] `workflow_dispatch` job: boots a real dev-project sandbox (`src/real-sandbox.ts` + `sandbox.yml` `real-sandbox` job) and runs the real-sandbox checks from PRs 3 and 4.
- [x] `internal-setup.sh` moves to the internal environment's `setup` override (the release stores it in `environments.hooks.setup`, `start` = `superset-dev-stack`).

Test
- [x] Dry run of the release against dev writes nothing on a failed probe (previous row intact). (two failed runs on 2026-09-14, a setup-hook exit and a wrong port, left the previous rows untouched; the third wrote them)
- [x] Successful dev release: new bundle sha on the row; an existing dev workspace picks it up on its next wake (boot.log shows the fetch and exactly the changed steps). (2026-09-14: golden `env-internal-mu0wro0a`, rows on the branch DB with bundle `c64136cb`; the dev workspace's next wake fetched it and re-ran only `install-host`)
- [x] Rollback: point the row at the previous sha; next wake flips `current` with no download. (2026-09-14 on the dev workspace: `bundle.installed e169f74b9994 was c64136cbbcae`, nothing fetched, both bundles on disk)

Evidence: two consecutive dev releases and one rollback, each with the box's boot.log.

## PR 6 — Multi-repository environments (added 2026-09-14)

Model (`plans/20260914-multi-repo-environments.md`)
- [x] `environment_repositories` (ordered, primary first), `cloud_workspace_repositories` (repository, branch, path), `environments.hooks_repository_id`, `scope`, `created_by_user_id` (migration `0117_environment_repositories_scope_and_workspace_repositories`, drizzle-kit output, applied on Neon `sandbox-v2-local-dev`).
- [x] Identity carries `SUPERSET_SANDBOX_REPOSITORIES`; the runner checks each repository out at `/workspace/<name>` with a marker per path; host-service seeds one project per checkout, the primary under the cloud workspace id.
- [x] One installation token per workspace, scoped to exactly the workspace's repositories (`repositoryNames` on the mint); the API refuses a mix of installations.
- [x] `environment.create/update {repositoryIds, hooksRepositoryId, scope}`, `list/get` return `repositories` and hide other people's personal rows; `cloudWorkspace.create {repositoryIds?}` for the shared environment, `listBranches {repositoryId}`, `repositories`.

UI
- [x] Desktop: environment dialog (name, repositories with resync, config location, scope, Skip & save, Start agent = create + onboarding workspace), edit for existing rows, list shows repositories and scope; new-workspace form shows a repository picker for the shared environment and reads branches from the primary repository.
- [x] Mobile: branch picker and cloud rows read the per-workspace repositories.
- [x] CLI/MCP unchanged: they create on environments that carry repositories.

Test
- [x] boot-twice and runner-check on the multi-repo runner (2026-09-14, local image on bundle `02923e44b5d4`: 24/24 and 13/13; second boot `checkout.skipped superset already done`).
- [x] The dialog and create flow over CDP (2026-09-14, dev app on the worktree stack): "Monorepo and plans" created from two repositories with the monorepo as config location, edited to personal; the new-workspace form shows the repository pill on `Default` and reads branches from the picked repository, then from the environment's primary after switching; "Start agent" on two public repositories opened a real box in 12.8 s (`first_healthy_at - provision_started_at`) with `/workspace/acme-demo` and `/workspace/homebrew-tap` checked out, two projects seeded (the primary under the cloud id), Claude launched in the primary checkout. A private repository fails in dev as before (the dev App is not installed on the organization; the API refuses to clone a private repository without a token).
- [x] A dev release with the monorepo as the internal environment's repository (2026-09-14, after the dev App was installed: `Superset dev` golden built from `superset-sh/superset` with the setup hook and dev-stack checks, probe with gate refusals and a stop-and-wake, rows written on bundle `8f775a4c12cd`).
- [x] The update flow on a live box (2026-09-14): a bundle carrying a new host-service published, the environment pinned to it, the box stopped and woken through `access`: `bundle.installed` then `install-host` flipped `current` to the new build and the box answered in 11.9 s. Found and fixed on the way: `install-host` took the first `host-service-*.tar.gz` in the media directory and an earlier build's tarball was still staged beside the new one, so the wake reinstalled the old build; `sync-assets` now prunes staged archives the manifest no longer names and the step picks the tarball by the manifest's hash (runner-check covers the prune).

## Final acceptance (real sandbox, dev then production)

- [ ] Create → terminal in the time P0 said we'd hit; reopen after a stop within budget. (NOT met: create 15.6 s and reopen 16.4 s medians on the v2 layout (from 19.6 s / 15.4–18.3 s); the box's share is 1.3 s and ours one round trip; 13–15 s is the platform bringing the VM up, which only P5 (a member already booted) can hide. Table in the start-time plan)
- [x] `docs/cloud-sandbox-acceptance.md` re-run end to end on the new layout; `docs/cloud-sandbox-mismatches.md` updated for anything new. (§11 of the acceptance doc is the v2 run (11.1–11.7 with evidence); the mismatches doc gained the run dir, the cwd, the env push, the per-port gate URL and the Chrome profile entries)
- [x] Security posture: no credential in `env` (real box 2026-09-14: host-service environ carries no brokered key, the box answers 401 without the secret, the gate refuses forged and missing tickets; the agent's `env | grep -c ANTHROPIC` printed 1, the placeholder; models answered 200 through the firewall), `/proc/<host-service>/environ` (other than the host secret placeholder set), or on disk; git and models work; the gate rejects a missing or forged ticket on both ports; the box rejects a request without the host secret on 4879.
- [x] Desktop: visible Chrome over CDP 9222; (Chrome 153 needs a non-default profile directory for CDP (fixed in the wrapper, `google-chrome-visible`); Playwright on `google-chrome-playwright` opened a second Chrome beside the visible one; take control and release both verified in the dev app) a Playwright launch on the private profile opens a second window; take-control not regressed.
- [ ] Production: image push, `sandbox:release --production` with the internal org id, first internal workspace on the new layout, canary release of the desktop that mints per-port tickets.
