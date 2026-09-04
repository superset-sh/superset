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

**The address is brokered and expires.** A sandbox has no stable URL — a
preview token is minted per workspace and re-minted before expiry
(`SandboxAccessProvider`). Code that caches a sandbox URL for longer than the
token's life will start 401ing. `mintPreviewAccess` talks to the provider's
control plane, not the sandbox, so it works even when the sandbox itself is
asleep or wedged.

**Three separate gates sit between the renderer and a sandbox**, and all three
fail as a bare `TypeError: Failed to fetch`: the renderer's CSP `connect-src`
allowlist, CORS on the provider's edge (set via the preview's
`responseHeaders`), and the WebSocket, which can't carry a header from a
browser and so takes the preview token as a `bl_preview_token` query param.
Testing from Node proves nothing about the renderer here.

**The edge sets a cookie, and the desktop's terminal socket depends on it
without saying so.** Any request that presents the preview token — header or
query param — comes back with `Set-Cookie: bl_preview_token=…; HttpOnly;
SameSite=None; Secure; Max-Age=86400`. Only the `/events` dial puts the token
on its URL; the `/terminal/<id>` dial (`useWorkspaceWsUrl`) sends `token=<jwt>`
and nothing for the edge, and works because Electron replays that cookie on
the upgrade. So terminals on desktop authenticate through a cookie the event
bus happened to earn first. Mobile can't inherit that — its terminal socket
lives in a WKWebView with its own cookie store — so it signs every terminal
dial with `bl_preview_token` explicitly. The desktop should too rather than
rely on ordering.

**The host-service secret does not apply, and a sandbox says so instead of
pretending otherwise.** Locally the secret stops anything else on the machine
from talking to a host-service bound to loopback; desktop and service share
one trusted device. A sandbox is reached across the internet, where the gate
that actually holds is the provider's private preview: the edge turns away
anything without a preview token, and only our API can mint one.

Keeping the PSK as a second layer was tried and rejected. One secret baked
into every sandbox is a cross-tenant credential, and every sandbox hands an
agent a shell that can read its own env — a second factor each tenant can read
is not a second factor, it just makes the posture look deeper than it is.
Generating one per sandbox would have worked, but it buys a layer whose only
job is to survive a misconfigured preview, at the cost of a stored secret per
workspace.

So in sandbox mode host-service uses `EdgeGuardedHostAuthProvider`, which
accepts everything, and the honest statement of the posture is: **one gate, at
the edge.** A sandbox whose preview is ever made public is open to anyone with
the URL. Treat preview configuration (`public: false`) as the security-
critical setting it now is.

**Model credentials never enter an image sandbox.** (A fork is the exception;
see "A fork can never have the egress proxy" below.) The provider's egress proxy
substitutes them at the edge from a `{{SECRET:...}}` routing rule; the sandbox
env holds only `SANDBOX_CREDENTIAL_PLACEHOLDER`. The placeholder must still be
*set* — an unset key reads as "not logged in" and produces no request for the
proxy to rewrite.

**Proxy credentials are fixed at creation, so a sandbox can't gain one later.** The
routing rules that carry them are part of the create call, which is the
property that stops a sandbox being re-pointed at a different secret mid-life.
The cost is that adding a provider, or rotating a key, reaches only sandboxes
created afterwards — existing ones keep the credential set they were born
with, and have to be recreated to change it.

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

**The image's ENTRYPOINT belongs to the provider.** The SDK appends
`ENTRYPOINT ["/usr/local/bin/sandbox-api"]` only when the image declares none,
and that binary is what serves `/process`, `/fs` and the preview routes.
Declaring our own to auto-start host-service produced a sandbox the platform
could not talk to at all — every exec came back 502, and there is no way to
debug from inside a sandbox whose exec is the broken thing. Long-running
processes are registered *through* the API instead (`process.exec` with
`waitForCompletion: false`).

**The platform injects `PORT`, and it beats the image's `ENV`.** host-service
reads `PORT`, so a sandbox that doesn't override it tries to bind 80 — reserved,
along with 443 and 8080 — and exits with `EADDRINUSE` before serving anything.
`start.sh` exports the port it means to use.

**The first two sandboxes after an image build take ~35s; the rest take ~0.3s.**
Measured on a freshly built image: 37.3s, 35.2s, then 0.3s, 0.2s, 0.3s. It is an
image pull, and the image is around a gigabyte — 766 MB of that `node_modules`,
230 MB the baked repo, 18 MB host-service itself. Two consequences worth knowing
rather than fixing: a stopwatch started right after a rebuild measures the pull,
not the product (which is how a 5s path got reported here as 40s), and most of
the weight is packages host-service imports at module load and never calls, so
the lever is that import graph rather than anything about sandboxes.

**The writable disk is half of memory, and there is no disk-size parameter.**
Documented, not a quirk: "Blaxel sandboxes reserve, when possible, approximately
50% of the available memory for the tmpfs filesystem" (Sandboxes → Overview,
"Memory and filesystem"). The root is an overlay over a read-only EROFS image
with a tmpfs upper layer, so 8 GB of memory gives 3.9 GB of disk, 16 GB gives
7.9 GB, 32 GB gives 16 GB (and 8 CPUs), and every file written also occupies
RAM. The `storageMb` our code used to pass was never a Blaxel field — the SDK
has `memory`, `region`, `ttl`, `expires` and `volumes`, nothing for disk — and
the `as never` cast let it through unnoticed (measured: 40960 still gave
3.9 GB). `/bl` is the provider's control mount, not storage. A checkout plus
`bun install` of this monorepo is ~6 GB, so a golden that carries
`node_modules` and expects to run the dev stack needs 32 GB of memory, and
every fork inherits that size along with the files. Filling the disk is what a
"wedged" sandbox looks like: every `process.exec`, even `echo`, returns
`status: failed` with empty logs from then on. The documented ways to get more
space are volumes (one per sandbox, attached at creation, not forkable) and
Agent Drive; neither fits the golden-and-fork model, which is why memory is the
lever.

**A fork takes its env on the fork request, and again on the boot script.**
`@blaxel/core` 0.3.19 accepts `envs` on `fork()`, which replaced the spec
update (and the restart it caused) that used to hand a fork its identity. The
values reach processes only when the sandbox runtime baked into the image is
current: on a golden built 2026-09-02 they landed in the spec and no process
saw them, PID 1 included; on one rebuilt 2026-09-03 every process did, and
fork plus get took under half a second. The `/app/start.sh` exec carries the
same env for goldens from before that rebuild, since everything the workspace
runs descends from it. A fork can only set or add variables, never drop one,
so promoting a workspace blanks its identity with empty values instead; an
empty value does override an inherited one (verified 2026-09-03: a golden's
`NODE_ENV=production` came back empty on a fork that set it to `""`).

**A fork can never have the egress proxy.** The proxy routing that injects
the org's model keys (`network.proxy.routing`) exists only on sandboxes created
with it: Blaxel's docs say enabling the proxy on a sandbox created without it
requires a new sandbox, and a fork is created without it (its `spec.network`
is null, and a source that carries routing hands its forks unresolved
`{{file(/var/run/secrets/…)}}` proxy templates, so every outbound request
fails with "Unsupported proxy syntax"). Applying routing to a fork afterwards with a
spec update (the SDK's `updateSandbox`, which nothing in this codebase calls
any more) is worse than useless: the platform builds a new instance from the
image, and the fork comes back without `node_modules`, the tools, or anything
else the environment carried (verified 2026-09-02 on a release probe). So a workspace forked from an environment gets its model keys the
plain way, as `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the environment's
variables, and host-service approves that key for Claude Code before an
unattended launch so it does not stop on the "use this custom API key?"
prompt. Image sandboxes keep the proxy and the placeholder keys.

**host-service has no HTTP health route.** Readiness is the `health.check` tRPC
procedure; `GET /health` 404s. A probe on the wrong path looks exactly like a
sandbox that never came up, which cost an afternoon here.


**Proxy secret injection needs the workspace entitlement.** Routing rules send
egress through the workspace's egress gateway; without it every request fails
its upstream CONNECT with a 407. Enabled for `superset` on 2026-08-16. Note
`/egressgateways` and `/vpcs` still 403 with "Dedicated IPs feature is not
enabled" even though routing works, so don't use those as a health check.

**Native modules pin the image.** node-pty's prebuild links glibc (so no
Alpine) and only the pinned version ships prebuilds at all; better-sqlite3 must
match what host-service was built against or it crashes on load. The image
asserts the prebuild exists rather than letting something compile silently.

**Local dev cannot exercise a sandbox, and the failure mode if you force it is
silent.** `setup.local.sh` copies `.env.local.example` to `.env`, which sets
`BLAXEL_API_KEY=fake-blaxel-api-key` — so provisioning fails at the provider and
no sandbox is ever created. That part is loud and fine. The trap is what happens
when someone supplies real Blaxel credentials to a local API to try a sandbox
end-to-end: provisioning passes `SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL`
into the sandbox, and in local dev that value is `http://localhost:3001`. Inside
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
