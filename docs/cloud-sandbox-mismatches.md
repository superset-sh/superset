# Where cloud sandboxes don't fit the app

**Tickets live in the Linear "Sandboxes" project** (https://linear.app/superset-sh/project/sandboxes-a52055bc936e). This file is the reasoning — what a sandbox is and why it differs from a machine someone owns — and stays the thing to read before changing this code. When you find something new, write it here and file the ticket there; when an item is fixed, say so here rather than deleting it, so the next person can see the shape of the trap.

A cloud workspace runs host-service inside a provider sandbox, which lets it
reuse the whole v2 stack — panes, terminals, git, agents — for free. The price
is a set of places where the app's assumptions were written for *a machine a
person owns* and a sandbox isn't one.

**This list is load-bearing, not documentation.** Every entry below cost
someone a debugging session. When you hit a new one, add it here in the same
shape (what the app assumes → what a sandbox actually is → what we did), even
if you worked around it in five minutes. The next person will not have your
context.

## Identity and ownership

**The workspace's name belongs to the cloud row, not the sandbox.** For a local
or remote host, `host.db` owns the workspace because the user created it there.
A cloud workspace is created, named (by the API's namer) and listed by the
cloud API; the sandbox's `workspaces` row exists only so host-service has
something to serve panes against. Renaming through the generic host path writes
a name nothing reads — `workspaces.rename` routes to `cloudWorkspace.rename`
for these. Treat the sandbox's copy as scratch.

**The project + workspace rows are still synthetic, but the sandbox writes
them itself.** A sandbox's checkout *is* its workspace, so host-service's
create procedures — which cut a worktree off a base repo — don't apply. It used
to be raw SQL executed from the API against a schema it shared no types with,
which meant any host-service migration could break provisioning silently. Now
host-service reads the identity from its own environment on boot and inserts
the rows through its own schema (`runSandboxSelfSeed`). Still a fabrication, and
the project id remains meaningless to the client — which is why cloud rows get
their own sidebar section rather than grouping under a project — but it can no
longer drift from the schema, and provisioning has nothing to execute inside
the sandbox.

**The sandbox's `hostId` addresses nothing.** `workspace.list` reports the
container's machine id. The fan-out restates it as the cloud workspace's id so
every host-keyed lookup (pull requests, agent status, diff stats) resolves.
Anything reading `hostId` off a raw sandbox response gets a dead id.

**There is no `v2_hosts` row.** Sandboxes are deliberately absent from the
hosts table, so anything that resolves a host through it degrades: the remote
version gate has nothing to check (skipped for cloud), and the unreachable
overlay renders "Unknown host".

## Addressing and auth

**The address is brokered and expires.** A sandbox has no stable URL the
client can keep — the API resolves the sandbox's domain and signs a
short-lived token per access, re-minted before expiry
(`SandboxAccessProvider`, `useWorkspaceHostUrl`). Code that caches a token
for longer than its life will start 401ing. Resolving talks to the provider's
control plane, not the sandbox, so it works when the sandbox is stopped.

**Addressing and waking are different requests.** The sidebar keeps a live
address for every ready cloud workspace, and none of those mints may resume a
sandbox — that is how every desktop in the organization kept every Blaxel
sandbox awake for the whole of its life. Only the open workspace's own mint
passes `wake`, which resumes a stopped session (a resumed session boots from
the filesystem snapshot with no processes, so host-service is started again)
and extends a running one so it never hits the idle stop while someone is in
it. `resolveSandboxAddress` is the one place that knows the difference.

**A woken sandbox answers seconds after the wake, and every pane reconnects
at once.** A resumed session has no processes; `wake` starts host-service
and returns before it listens. The open workspace's hook therefore holds the
address back until `health.check` answers (`waitForHost`), and the host
fan-out skips a sandbox the last access reported as not running (`running`
on the access response) until that hook re-addresses it. Without both, every
hook fired into the boot window, the terminal-agent auto-resume burned its
one attempt on a 502, and the agent pane sat on "Disconnected" until the
next token refresh minutes later. What a person sees now: the pane
reconnects, the lost session is reported gone, and the agent is resumed into
a fresh terminal with its scrollback (the cold-restore path), about 15–20 s
after opening.

**Two gates sit between the renderer and a sandbox**, and both fail as a bare
`TypeError: Failed to fetch`: the renderer's CSP `connect-src` allowlist
(`https://*.vercel.run`), and the WebSocket, which can't carry a header from a
browser and so takes the token as the `token` query param — the same param a
local host reads its secret from. CORS is answered by host-service itself in
sandbox mode (`*`; the bearer, never a cookie, is what gates it). Testing from
Node proves nothing about the renderer here.

**The sandbox's URL is public, so host-service is the gate.** Locally the
pre-shared secret stops anything else on the machine from talking to a
host-service bound to loopback. A Vercel sandbox's exposed port is a public
`vercel.run` domain with nothing in front of it, so in sandbox mode
host-service checks a token the API signed for exactly this workspace
(`SandboxAccessHostAuthProvider`): Ed25519, ten-minute expiry, audience = the
cloud workspace id. The sandbox holds only the public key
(`SUPERSET_SANDBOX_ACCESS_PUBLIC_KEY`), so nothing inside it — an agent that
can read its own environment included — can mint access to itself or to any
other sandbox, and a token for one workspace is refused by every other. A
sandbox booted without the key refuses to serve rather than serving everyone.

That replaces the Blaxel-era posture, where a private provider preview did
the gating and host-service accepted everything (`EdgeGuardedHostAuthProvider`,
gone). The old reasoning against a host-side secret was that a *shared* one
is a cross-tenant credential every tenant can read; a signed token has no
secret in the box to read. `health.check` stays public on purpose — it is
how a client tells a booting sandbox from a dead one — so probe the gate on a
guarded route (`/events`), not on health.

**Model credentials never enter a sandbox.** The organization's keys are
injected into egress by the sandbox firewall: a `transform` rule on
`api.anthropic.com` / `api.openai.com` sets the auth header, and the sandbox
env holds only `SANDBOX_CREDENTIAL_PLACEHOLDER`. The placeholder must still be
*set* — an unset key reads as "not logged in" and produces no request to
rewrite. A workspace that brings its own credential for a provider — an
environment variable, or the person's own sign-in (`agent_credentials`) —
gets no rule for that provider, so its credential reaches the API untouched;
a Claude subscription token counts as Anthropic being provided, since a rule
would otherwise add a second, conflicting auth header to its requests.

**The firewall terminates TLS for the domains it rewrites, and the terminal
must trust its CA.** The platform mounts a per-sandbox CA and points
`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE` and friends at the system bundle.
host-service builds PTY env from a login-shell snapshot, never from its own
process env, so those variables would be lost and every model call from a
terminal would fail with a certificate error; the sandbox-mode passthrough
forwards them (`SANDBOX_FIREWALL_CA_KEYS`).

## Runtime environment

**No user, no login shell, no rc files.** host-service builds PTY env from a
login-shell snapshot and deliberately never from its own `process.env`. In a
sandbox that yields a terminal with no credentials at all — the symptom is
Claude reporting "Not logged in" while the key is plainly in the sandbox env.
`buildV2TerminalEnv` forwards an explicit credential allowlist in sandbox mode
only.

**Agent CLIs are pre-configured in the image.** A first run otherwise opens a
theme picker, an API-key approval and a workspace trust dialog — three
confirmations no one is there to answer. The image bakes `/root/.claude.json`.
Note that a headless `-p` run writes none of those keys, so a smoke test passes
while the interactive TUI still blocks.

**Claude refuses its own launch flags under root. Open until the image is
rebuilt.** The builtin agent runs `claude --dangerously-skip-permissions`, and
a sandbox runs as root, so picking Claude in a cloud workspace printed
"--dangerously-skip-permissions cannot be used with root/sudo privileges" and
exited — found from the mobile app, but the desktop launches the same
command. Claude allows the flag under root when `IS_SANDBOX=1` is in its
environment (verified from a sandbox terminal), and then asks once to accept
Bypass Permissions mode, another dialog a headless smoke test never reaches.
host-service now sets `IS_SANDBOX=1` in sandbox-mode PTY env and the image
bakes `bypassPermissionsModeAccepted: true` into `/root/.claude.json`; neither
reaches an existing sandbox, and neither reaches a new one until the image is
rebuilt.

**The checkout is the workspace.** No worktrees, no base repo, no branch
creation — anything assuming a worktree can be created or discarded next to a
main checkout has nothing to work with.

**There is no clipboard where the PTY runs.** Pasting an image into a terminal
forwards Ctrl+V and lets the TUI (Claude Code, Codex) read the image from the
OS clipboard — of the machine the PTY runs on. A sandbox (or any
relay-reached host) never holds the user's local screenshot, so the paste
silently did nothing or surfaced "Failed to paste image". Fixed renderer-side:
for non-local hosts the desktop ships the clipboard bytes over
`filesystem.writeFile` into the shared `.superset/attachments/` worktree dir
(the same convention the agent-launch terminal adapter and the mobile
composer use — mobile proved the pattern) and pastes the worktree-relative
path instead (`setImagePasteOverride` in the terminal runtime registry).
Chosen over a new host endpoint because deployed sandboxes never update
their baked host-service.

## Lifecycle

**Delete is not wired.** The generic delete routes to the owning host, which
for a cloud workspace deletes the row *inside* the sandbox and leaves the
sandbox running (and billing) plus the `cloud_workspaces` row intact — the
workspace reappears on the next refetch. It needs to call
`cloudWorkspace.delete`. **Open.**

**Sidebar affordances are driven by local state, not by the row.** Visibility,
pinning and ordering live in `v2WorkspaceLocalState`; a section that renders
straight off an API list will show "Remove from sidebar" doing nothing. Cloud
rows read the same collection as every other row.

**Drag ordering isn't wired** — the cloud section sits outside the DnD
containers. **Open.**

**A sandbox's host-service is frozen at the version it was provisioned with,
and nothing updates it. Open, and the most consequential item on this list.**
On a machine someone owns, the desktop app ships host-service and updates it:
new app version, new binary, one restart. A sandbox instead bakes
`packages/host-service/dist` into the image, so its host-service is whatever
the image held on the day it was created. There is no updater in there, and
the app can't push one.

Every release therefore widens a gap between a desktop that has moved on and
sandboxes that haven't. The failure mode is not a clean version error — it is
a client calling a procedure the sandbox's router doesn't have, or sending an
auth shape it no longer expects, and the user seeing a workspace that is
simply broken with no way to fix it short of recreating it and losing the
uncommitted work inside. Long-lived sandboxes are exactly the ones people will
care about most, so this gets worse with time rather than better.

What it needs, roughly in order of how much it buys:

- **A version handshake.** The sandbox reports the host-service version it is
  running and the app compares it against what it expects, so a mismatch
  surfaces as a clear "this workspace needs updating" instead of a broken
  pane. Nothing else is safe to build until the app can tell.
- **In-place update.** Ship a new `dist` into a running sandbox and restart
  host-service, the way the desktop does — the sandbox has a filesystem and a
  process supervisor, so this is mechanically possible.
- **Recreate-with-carryover** as the fallback for a sandbox too old to update:
  push the branch, provision a fresh sandbox, restore the checkout. Slower,
  but it must exist for the cases where in-place fails.

Note that the *image tag* lives on the environment row (`sourceRef`, seeded from
the `SANDBOX_IMAGE_NAME` constant), so new sandboxes pick up a rebuilt image for free. It is only existing ones
that strand — which is why this reads as fine right up until the first
long-lived workspace.

## Provider constraints

**The platform runs no ENTRYPOINT or CMD for a custom image.** `/app/start.sh`
is launched through `runCommand` (detached) after create, and again on every
wake, guarded by a port check so two wakes can't stack two servers.
(Blaxel was the opposite: its own `sandbox-api` owned the entrypoint slot.)

**A freshly pushed image is not usable for a few minutes.** VCR reports the
tag `Preparing` while it optimises a `linux/amd64` build (a gigabyte takes
about four minutes), and `Sandbox.create` answers 409 `image_not_ready` until
it reads `Ready`. `sandbox:release` waits; anything else pointing an
environment at a tag it just pushed has to as well.

**Disk is 64 GB regardless of memory.** Memory is 2 GB per vCPU and the plan
caps it (Pro: 8 vCPU, 16 GB); disk is separate NVMe. This retires the Blaxel
rule that the writable root was tmpfs at half of memory and that a full disk
wedged every exec — the reason goldens ran at 32 GB. The internal golden runs
8 vCPU for the dev stack's RAM, and forks inherit it; image workspaces get 4.

**A session ends; the sandbox does not.** A session stops at its timeout
(`SESSION_TIMEOUT_MS`, four hours, extended while a workspace is open) or on
`stop()`, and the platform snapshots the filesystem. The next wake boots a
new session from that snapshot with *no processes*: uncommitted files survive,
a running agent does not. Blaxel froze the VM instead, processes intact. So
an unattended agent run has to finish within a session, and the idle stop
must not fire on a workspace someone is using — which is what the open
workspace's `wake` on every token refresh is for. Sessions cap at 24 hours on
the plan; past that the extension is refused and the next open resumes.

**A fork starts from the source's snapshot, not its live filesystem.** A
golden is therefore a *stopped* sandbox: `promoteSandboxToEnvironment` takes
a snapshot of the promoting workspace, creates the golden from it with an
empty env, removes the identity files, and stops it — that stop is what forks
start from. Identity, git token and agent credentials are configuration on
Vercel, not files, so a golden created with `env: {}` simply doesn't have
them; no blanking on the fork request as Blaxel needed.

**`snapshot()` ends the session, and the snapshot is what the sandbox resumes
from.** Measured while promoting: the source is `stopped` afterwards, and its
`currentSnapshotId` is the snapshot just taken. Deleting that snapshot — the
obvious tidy-up once the golden exists — leaves the workspace unable to ever
resume (`410 Cannot resume sandbox: no snapshot available`), which is how one
e2e workspace died. So the snapshot stays (`keepLastSnapshots` evicts it on
the source's next stop), and a source that was running is started again
before promote returns. A row whose sandbox is gone or unresumable is marked
`failed` by the next `access`, so it gets the failed screen and a Remove
button rather than a sidebar entry that never opens.

**`stop()` returns before the stop's snapshot is current.** The sandbox is
still `stopping` when the call resolves, and a fork taken then boots from
whatever snapshot was current before — for a sandbox that has never stopped
(a golden fresh from the image), nothing but the image. Measured: a file
written just before the stop was absent from an immediate fork, and release
probes forked that early found an empty `/workspace`, cloned into it and lost
every baked dependency, with the golden itself intact minutes later. Promote
and the release poll until `currentSnapshotId` has changed and the status is
`stopped` (`waitForStopSnapshot`) before anything forks.

**Snapshots exist only in the region they were taken.** Forking a golden into
another region is refused (`snapshot_region_mismatch`), and failover regions
don't replicate it. Forks therefore inherit the golden's region and only
image-created sandboxes get `VERCEL_SANDBOX_REGION` — passing the setting on
a fork was what failed every workspace once the goldens moved to sfo1.

**The firewall policy is live-updatable and forks carry it.** Credential
brokering (`networkPolicy` with `transform` rules) can be set at create, on a
fork, or changed on a running sandbox, and a fork copies the source's policy
unless overridden. Both Blaxel limitations — routing fixed at creation, forks
unable to have the proxy at all — are gone, which is why every sandbox now
brokers the organization's keys. A custom policy denies everything it doesn't
list: the `"*": []` catch-all is what keeps npm, git and the rest reachable.

**A fork copies the source's config; every field we pass is an override.**
Resources, timeout, ports, tags, network policy, persistence and env are all
inherited unless set on the fork request. Provisioning passes the workspace's
full env and policy explicitly so nothing rides in from the golden by
accident.

**Sandboxes and images are scoped to one Vercel project.** Everything lives in
the team's `sandboxes` project (`VERCEL_SANDBOX_PROJECT_ID`); the deploy
token for the API project cannot see it, hence the separate
`VERCEL_SANDBOX_TOKEN`. Deleting a sandbox keeps its snapshots (and their
storage bill) unless `deleteOrphanSnapshots` is passed; `deleteSandbox` does.

**The sandbox's config env is capped at 4 KB.** `Sandbox.create`/`fork`
answer `400 env payload too large` past that, and the internal environment's
variables alone are ~9 KB (Blaxel took 98 keys without comment). So the
sandbox env carries only the workspace's identity and credentials (checked
against the cap at provision), and the environment's variables are written
to `/data/environment.env` (root-only) right after create, which
`/app/start.sh` sources on every boot before host-service and the desktop
session start. A golden has that file removed at promote; a fork gets its
own. Same delivery as before from the sandbox's point of view: everything
below the boot script sees them as process env.

**The desktop is an Xfce session, view-only until taken.** The display is
1920×1200 at 96 DPI and runs `xfce4-session` (panel, xfwm4, xfdesktop,
Thunar, xfce4-terminal) with Plank for the dock (Chrome, Files, Terminal) and
one of eight generated wallpapers chosen by the workspace id, so it is stable
across wakes and differs between boxes. Chrome runs as root and so launches
with `--no-sandbox` (plus `--test-type`, which hides the bar that flag
otherwise adds to every window); its first run is pre-answered — the `First
Run` sentinel and `--no-first-run` skip the terms dialog, and a managed
policy turns off sign-in, sync and the default-browser prompt. The golden's
dev stack is an Xfce autostart entry (`superset-dev-stack`) rather than an
openbox autostart. In the app, the Desktop pane connects view-only and only
forwards input after "Take control" — an agent may be driving that desktop,
and a pane that merely has focus must not type into its browser.

**A multi-line variable (a PEM key) did not survive into `/workspace/.env`.**
The in-sandbox materializer skipped values containing newlines, so the dev
stack's API failed env validation on `GH_APP_PRIVATE_KEY`. It now writes them
double-quoted with `\n`, which dotenv reads back as newlines.

**Ports answer at a random per-sandbox domain.** `sandbox.domain(4879)` is
`https://sb-<random>.vercel.run`, unrelated to the sandbox's name and stable
for the sandbox's life. There is no per-port authentication — see the auth
section — and up to 15 ports may be exposed; exactly one is.

**Native modules pin the image.** node-pty's prebuild links glibc (so no
Alpine) and only the pinned version ships prebuilds at all; better-sqlite3 must
match what host-service was built against or it crashes on load. The image
asserts the prebuild exists rather than letting something compile silently.

**Local dev cannot exercise a sandbox, and the failure mode if you force it is
silent.** `setup.local.sh` copies `.env.local.example` to `.env`, which sets
`VERCEL_SANDBOX_TOKEN=fake-vercel-sandbox-token` — so provisioning fails at the
provider and no sandbox is ever created. That part is loud and fine. The trap is
what happens when someone supplies real Vercel credentials to a local API to try
a sandbox end-to-end: provisioning passes `SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL`
into the sandbox, and in local dev that value is `http://localhost:<port>`. Inside
the container `localhost` is the container, so the sandbox boots, serves, and
looks healthy while every call it makes back to the API dials itself. Nothing
reports an error at provision time. Treat sandboxes as a deployed-API-only
surface, or tunnel a public URL and override `NEXT_PUBLIC_API_URL` for the
provisioning process specifically.

**Sandbox telemetry does not travel with the desktop build.** The host-service
Sentry DSN is compiled into the desktop bundle at desktop build time
(`apps/desktop/electron.vite.config.ts`) and handed to host-service when the
desktop spawns it. A sandbox is started by the API and never sees a desktop
bundle, so it can never receive that DSN — which is why sandbox startup crashes
were invisible for as long as sandboxes have existed, rather than merely
under-reported. Sandboxes now report to their own project via
`SENTRY_DSN_SANDBOX` on the API, tagged with the cloud workspace id, image tag
and provider. Keep the workspace id on both sides: a provisioning failure is
recorded against the API and a runtime failure against the sandbox, and that id
is the only thing that joins the two halves of one broken workspace.
