# Sandbox start time — proposed

Status: proposed, 2026-09-13. Owner: cloud workspaces. Goal: a new cloud
workspace shows a live terminal in under 3 seconds; a reopened one in under 8.

## Where the time goes today

Measured 2026-09-14 by P0 (`bun run sandbox:measure`, five creates and five
reopens against the dev golden `env-internal-mu0tzcdu`, sfo1, 8 vCPU, an
environment with no variables; a second run of three and three agreed, and
its medians are the second number where they differ). Job stamps come off the
`cloud_workspaces` row, boot stamps off host-service's `health.check`, and the
first 200 from a 100 ms probe next to the API's own one-second wake poll.

| Stage | Where | Measured (median) |
| --- | --- | --- |
| `cloudWorkspace.create` writes the row, nudges | API | 0.03 s row write; job starts 0.03 s later (dev runs it inline) |
| QStash publish → provision job | API | prod only, not measured here |
| Name from the model, alongside clone lookup and environment | job | 0.74 s (0.55 s) |
| `Sandbox.fork` from the golden | Vercel | 0.92 s, and the sandbox reports `running` |
| Write `/data/environment.env`, fire `start.sh` detached | job | **14.6 s** (15.6 s): the first SDK call after the fork blocks until the VM is up; 1.0 s in 2 of 9 boots |
| Row → `ready`, nudge; client refetches list | API + client | 0.03 s job side; the desktop saw `ready` 4.1 s after pressing create on a 1.0 s boot |
| Access mint with wake → `Sandbox.get`, extend, wait for health | API | 3.34 s from `ready` on the 1 s poll, against 3.16 s to the true first 200 |
| `start.sh`: env, host.db copy, `git fetch --depth 1` + checkout, `dockerd`, Xvnc + xfce, **then** `node host-service.js` | sandbox | 2.03 s from `boot.start` to the exec, 1.94 s of it the fetch and checkout; node then takes 0.13 s to start and 0.94 s to listen: **3.16 s** boot to listening |
| Panes connect through the gate, agent launches | client + sandbox | 5.6 s from the first 200 to the first terminal attaching (desktop event) |

Create to first 200: **19.6 s** median, 21.0 s max (n=5); 20.3 s median with one
5.3 s outlier (n=3). Reopen (stop, then wake): **15.4 s** median, 17.6 s max
(n=5); 17.9 s (n=3). Of a reopen, 14.3 s (16.3 s) is the resume itself, from
the wake call to `boot.start`; the boot script then reaches the exec in 0.05 s
and host-service listens 1.08 s later.

What the desktop reported (`cloud_workspace_opened`, one real create and one
real reopen over CDP, same golden): create → ready 4.1 s, ready → first 200
3.9 s, ready → first terminal 9.5 s; reopen: ready → first 200 18.6 s, ready →
first terminal 22.5 s. Job stamps on that create: 0.06 s to job start, 0.71 s
to the fork, 0.88 s fork, 0.99 s to boot fired, 2.97 s boot fired to the first
healthy wake.

Two probes against the SDK alone, one sandbox each, to place the 14.6 s: a
fork with the credential-brokering firewall policy answered its first
`writeFiles` after 15.1 s, a fork with `allow-all` after 0.6 s; a stopped
sandbox resumed on `runCommand` in 16.8 s with the policy and 15.6 s without.
The fork wait correlates with the policy at n=1 and is not proven by it — the
desktop create above carried the same policy and booted in 1.0 s.

Where that leaves the plan: the boot script we own is 2 s on a create (the
checkout) and 0.05 s on a reopen, host-service is 1.1 s, and everything else
is the platform bringing a VM up (~15 s on both paths). P1 and P2 recover
about 1 s on a create, P3 about 0.2 s of poll slack and the client refetch;
the 3 s create target needs P5, a member already booted, and the 8 s reopen
target is under the measured resume floor.

Two structural facts drive the plan: the identity of a workspace rides in the
sandbox's create-time env, so nothing can exist before the create call; and
host-service is the last thing the boot script starts.

## Where the time goes on the v2 layout

Measured 2026-09-14 after `packages/sandbox` landed (`bun run --cwd
packages/sandbox measure`, three creates and three reopens against the dev
golden `env-internal-mu0xelrw`, sfo1, 8 vCPU, bundle `336c6f9e`). The control
plane writes the identity file and fires the policy update together, then
boots with the secret in the command's env, polls health at 100 ms and, on a
create, settles instead of re-running the wake. (Measured with the identity
in the boot command's env, one call fewer; the file write chosen afterwards
adds about 0.3 s to these numbers.)

| Stage | Where | Measured (median) |
| --- | --- | --- |
| Name, clone token, environment, repo hooks | job | 0.31 s |
| `Sandbox.fork` | Vercel | 0.71 s |
| Write the identity, fire boot (the first call to touch the VM waits for it) | Vercel | **13.2 s** (2.4 s on one of three: the VM was already up) |
| `superset-boot` to `host.exec` (run dir, bundle check, three passes) | box | 0.27 s |
| host-service process start → listening | box | 0.84 s |
| boot fired → first healthy, as the job's own wake saw it | job | 1.28 s |
| create → job returned (row ready, env pushed) | | **15.6 s** median, 17.1 s max; 2.7 s on the warm one |
| reopen: wake → `boot.start` (the resume) | Vercel | **15.0 s** |
| reopen: `boot.start` → host-service listening | box | 1.33 s |
| reopen: wake → first 200 | | **16.4 s** median, 19.3 s max |

Against the first table: the box's own share of a create fell from 3.2 s to
1.3 s (no checkout on a fork of a golden that carries one, host-service
first, three hash-compare passes at 0.27 s), the control plane's from ~1.5 s
of sequential calls to one round trip plus a 0.3 s claim, and the whole
create from 19.6 s to 15.6 s. The remaining 13–15 s on both paths is the
platform bringing the VM up, the same floor the first table found. P5 (a
member already booted) is now the only lever left on either path; the
in-sandbox and control-plane items of P1–P3 are done by the layout itself.

## Plan, one PR each

**P0 — Measure. Done 2026-09-14.** One trace per create. `start.sh` stamps
every step to `/data/boot.log` with millisecond timestamps; host-service
reports the current boot's stamps and its runtime on `health.check`; the API
records job-side stamps (job start, sandbox create start/end, boot fired,
first healthy wake) on the row; the desktop emits `cloud_workspace_opened`
with create→ready, ready→access, ready→first-200 and ready→first-terminal.
`bun run sandbox:measure` runs five creates and five reopens against the
newest fork environment and prints the stage table; the numbers above are its
output.

**P1 — host-service first.** Reorder `start.sh`: source env, copy host.db,
start host-service at once; the branch checkout, `dockerd` and the display are
side effects that run after it, each waiting on its own precondition rather
than on a script position (the display already waits for X; Docker waits for
nothing and should not start until a workspace asks — the reference runs the
daemon from a per-workspace start hook, never from platform boot). Replace the
30-line xfconf XML written per boot with one `xfconf-query` after the window
manager is up. host-service already tolerates the workspace appearing late for
a clone; verify it does for a fetch-and-checkout on the baked repo. Expected:
−3 to −5 s on every create and every wake.

**P2 — Name off the critical path.** The model-generated name reaches the
sandbox only to name host-service's fabricated workspace row, which nothing
user-facing reads. Drop `SUPERSET_SANDBOX_WORKSPACE_NAME`, let that row be
"workspace", and generate the name where the API writes its own row, off the
provisioning path. The fork starts the moment the job does. Same PR: build
the sandbox's env in one place (`sandboxWorkspaceEnv()`), used by provisioning
and the release probe, which today spell it by hand. Expected: −0.7 s
typical, more when the model is slow.

**P3 — Push, not poll; readiness from the thing that is ready.** `ready`
already nudges; the client refetches on it and mints with wake at once. The
API resumes, fires boot and returns the ticket immediately; the access
provider polls `health.check` through the gate every 250 ms and publishes the
address on the first 200, so the API holds no 60-second function and has no
timeout path. Same PR: the provision job runs under `waitUntil` from
`@vercel/functions` instead of a QStash hop, one code path in dev and prod;
a row still `provisioning` after two minutes is swept to `failed` (P4's
helper). Expected: −1 to −3 s.

**P4 — Let the SDK own resume.** `Sandbox.getOrCreate` by name with the
`onCreate` hook for first boot and the resume path for wakes replaces our
`nc -z || exec start.sh` guard and the recomputed `sandboxNameFor`. Same PR:
status transitions through one `transition(from, to)` helper, which closes the
provision-versus-delete race and the never-reaped `deleted` rows. Cleanup, not
speed; it makes P5 safe.

**P5 — Warm pool.** With identity delivered as a file (P2) and boot ordered
(P1), a sandbox can exist before anyone asks for it. Keep N forks of the active
golden per environment already booted to "host-service listening, no
identity"; create becomes claim: write the identity file, tell host-service to
self-seed, check out the branch. A running pool member makes create ≈ 2–3 s;
a stopped one costs a resume (≈ the fork floor) but nothing idle. Pick N and
running-vs-stopped from P0's numbers and Vercel's per-second CPU and memory
billing; start with one running member per environment with a short idle stop.

## Borrowed from the reference machine

Its boot scripts were captured on the anatomy page. What transfers: the
runtime and the desktop start in parallel and the desktop never gates the
runtime (P1); Docker is a per-workspace opt-in start hook, not platform boot
(P1, and later a per-workspace `install`/`start` layer we lack entirely); the
checkout is baked and the branch is chosen at claim (P2, P5); each service
signals its own readiness (P3); every phase is logged with millisecond stamps
(P0); one config file for every display number, applied at build time and only
sourced at boot; scripts shipped as files with a hashed manifest and a named
step registry with per-step version markers and a fail-open sentinel that
disables a step after three consecutive failures (the survey's "scripts as
files" item, alongside P4). What does not: a runtime downloaded per boot and a
provisioner that reconciles any image to spec, both of which exist because
that platform has a supervisor and user-built images; a Vercel snapshot is
already the cache, and our image rebuild is the release.

## Not in scope

Vercel's fork and resume floor; the relay; the desktop pane's own start. The
gate is done (#7467) and unaffected by any of this.
