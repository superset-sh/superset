# Cloud sandboxes: what to settle before this leaves the team

**Tickets live in the Linear "Sandboxes" project** (https://linear.app/superset-sh/project/sandboxes-a52055bc936e). This file is the reasoning — what a sandbox is and why it differs from a machine someone owns — and stays the thing to read before changing this code. When you find something new, write it here and file the ticket there; when an item is fixed, say so here rather than deleting it, so the next person can see the shape of the trap.

Companion to `cloud-sandbox-mismatches.md`. That file is about where a sandbox
doesn't behave like a machine someone owns; this one is about what we still owe
before people outside the team can create one.

Today the feature is gated two ways: a PostHog flag, and an `@superset.sh`
check in the API. Several things below are fine *only* because of that second
gate — they are marked **gated**, and every one of them becomes blocking the
moment a non-internal user can create a sandbox. Treat removing the gate as the
event that promotes them all.

## Money

**A sandbox bills from provision, not from ready.** Everything after that call —
resolving the repo, cloning, booting host-service — can fail with a sandbox
already running. Create now tears the sandbox down on failure and keeps the
`failed` row as the record; before that fix, one session left ten failed
provisions running indefinitely, and nothing in the product would ever have
shown them.

**Nothing stops an idle sandbox.** No TTL, no idle-stop, no per-org quota, no
cost visibility in the product. A workspace someone opened once keeps costing
money until a human notices in the provider console. Decide the policy (sleep
after N hours idle? hard TTL? quota per org?) before there are enough of them to
matter.

**Delete doesn't delete.** The generic delete routes to the owning host, so it
removes the row *inside* the sandbox and leaves the sandbox and the
`cloud_workspaces` row alive; the workspace reappears on the next refetch. Until
this points at `cloudWorkspace.delete`, the only real teardown is manual.
**Open.**

## Credentials and blast radius

**Model credentials are ours. gated** Every sandbox runs on the org's Anthropic
and OpenAI keys, so agent usage lands on our bill with no per-org attribution or
cap. Fine while only we can create sandboxes; unshippable after. Note the
routing secrets are fixed when a sandbox is created, so rotating a key does not
reach sandboxes that already exist — plan rotation as "re-create", or move to
per-org credentials first.

**The GitHub token outlives the clone.** `git clone` with the token in the URL
writes it into `.git/config`, so a repo-scoped installation token sits in the
working tree for anything in the sandbox to read — including an agent that
followed a prompt injection. This is the same exposure we removed for model
keys by using the egress proxy, left open for a credential that can write to the
repo. Either strip the remote after cloning and supply credentials per
operation, or route git through the proxy the same way.

**A sandbox has exactly one gate. gated** The shared host-service secret this
entry used to describe is gone: host-service in a sandbox trusts the provider's
edge and checks nothing itself (`EdgeGuardedHostAuthProvider`). That removed a
cross-tenant credential every tenant could read, and it left the preview token
as the whole of a sandbox's access control. Anything that defeats the edge —
a preview drifted to `public: true`, a provider bug, a leaked token — yields
terminals, git and the filesystem, with nothing second to get past.

What makes that worth more than the sandbox itself: code execution inside gets
the customer's repo, the write-scoped GitHub token in `.git/config` above, and
the ability to *spend* our model keys through the egress proxy. The proxy stops
an attacker reading those keys; it does not stop them using them.

Four things to settle before the gate comes off, none of them needed while it
is only us:

- **Watch for `public: true`.** Preview configuration is now security-critical
  and nothing alerts on drift. An automated check over live previews is cheap.
- **Get the token out of the query string.** A browser can't set headers on a
  WebSocket upgrade, so the preview token rides as `bl_preview_token` in the
  URL, where it reaches logs and proxies far more readily than a header would.
  Single-use or shorter-lived tokens for the socket path bound it.
- **Narrow CORS.** `Access-Control-Allow-Origin: *` grants no ambient authority
  (the token is not a cookie), but it does make a leaked token usable from any
  origin. Pin it to the app's origins.
- **Reconsider a second layer.** Per-sandbox secrets were rejected deliberately
  — see the mismatches doc — on the grounds that a shared one obfuscated the
  posture. A *per-sandbox* one would not have. Worth revisiting when the
  population stops being us.

## Untested behaviour

These are unknowns, not known failures — but each could change the design, and
none is expensive to answer.

**Sleep and wake.** Providers stop idle sandboxes. Does host-service come back
when one wakes? It is started with `nohup`, not a supervisor, so nothing
restarts it if it dies. Token minting talks to the control plane and keeps
working either way, which means the app may believe a dead sandbox is reachable.

**Disk durability.** Whether uncommitted work survives a stop/restart or a
recycle is unverified. "Your work vanished" is the failure that ends the
feature, so verify it before inviting anyone in.

**Token refresh across a backgrounded app.** Access is re-minted at 80% of a
10-minute life. An app asleep past expiry should recover on the next tick;
untested.

## Workflow

**Getting changes out is unverified.** Push and PR creation from a sandbox
haven't been exercised end to end. Without them the feature is a demo — this is
the first thing to prove, ahead of any polish.

**No fleet view.** Nothing in the product lists running sandboxes, their cost,
or lets you stop one. Today that lives in the provider console.

**Nothing reaps a row stuck in `provisioning`. Open.** A create that dies
between inserting the row and reporting the sandbox leaves a `cloud_workspaces`
row in `provisioning` forever: the sidebar shows a workspace that cannot open,
`access` refuses it because the status isn't `ready`, and no code path ever looks
at it again. It happened for real — a production create hit the API function's
60s limit mid-bootstrap, and the row outlived the sandbox it named. Provisioning
is ~5s now, so the window is small rather than gone; a killed function, a
provider timeout or a crash still lands there. Wanted: a sweep that fails rows
older than a few minutes and tears down any sandbox they name, plus the same
teardown on the paths that can't currently reach it. One row from that incident
had to be cleared by hand.

**The Superset CLI is offered but not installed. Open.** A cloud workspace's
agent row includes "Superset CLI" alongside Claude, Codex and Copilot, and
picking it fails with command-not-found: the image installs the agent CLIs but
not ours. It also matters beyond the picker — the CLI is how an agent spawns
workspaces and other agents, so a sandbox without it can't orchestrate. Install
it in the image, or hide the option for cloud workspaces until it is there.

**Creating doesn't open the workspace. Open.** Submit returns, the row appears
in the sidebar, and the user has to click it. Every other creation path lands
you in the thing you just made.

**Submit shows a pending state rather than a toast. Done.** Creation used to
report progress through a toast ("Creating cloud workspace…" → "Cloud workspace
created"), which put the state of a thing you were waiting on in a corner,
detached from the button you pressed. The submit control now carries it —
spinner, disabled in flight — and only failures toast. Kept here as the
reasoning, since the same argument applies to any other await we add to this
flow.

## Model

**A cloud workspace is tied to a `v2_projects` row, and that table is already
retired. Open.** #6436 decoupled the app from cloud `v2_projects` and dropped
the FKs that pointed at it "ahead of the table's removal"; nothing writes a row
there any more. Three days later `cloud_workspaces.project_id` landed as a
cascade FK into it, and `create` / provisioning resolve the repo to clone from
that row. So only projects that still have a legacy row can get a cloud
workspace, the desktop picker offers projects the API then rejects, and
dropping the table would cascade-delete every cloud workspace. The mobile port
lists the rows that resolve to a repo through an interim
`cloudWorkspace.listProjects`, fenced as such.

The row was never the point — provisioning only ever wanted a repo to clone, a
credential to fetch it with, and a display name. What it should hang off is an
**environment**: an org-scoped definition of what a sandbox contains — repos
(0..n, one primary), setup commands, env var names, base image/version, and
later a provider snapshot per version (SUPER-1892). `cloud_workspaces` then
references the environment plus the primary repo's branch. Keep v1 of that
entity to exactly one primary GitHub repo, enforced by validation rather than
schema: host-service assumes one workspace is one git root, and multi-repo or
no-repo sandboxes push into every git-shaped feature (status, diff, PRs,
files-changed) before they can degrade gracefully.

**Clients must not orchestrate a create.** Creating a cloud workspace is one
API call; the sandbox does the rest on boot (self-seed, fetch, start). Two
follow-ups fall out of holding that line rather than compensating in the app:
the sandbox should launch the agent from the typed prompt itself (today the
prompt only feeds the auto-name and nothing runs it — desktop and mobile both
open to an empty workspace), and attachments for a sandbox belong in blob
storage rather than written to the host, so a create can carry them before the
sandbox exists. Neither should be done by having a client wait for `ready` and
call `agents.run`.

## Provider

**Proxy secret injection depends on a workspace entitlement.** Routing rules send
egress through the workspace's egress gateway; without it every outbound request
fails its upstream CONNECT with a 407. Enabled for `superset` on 2026-08-16 —
a second provider workspace (staging, another region) needs it enabled too or
sandboxes there lose all model access.

**Preview URLs are the only ingress.** No relay hop, which is why WebSockets
work and a sandbox can sleep — but it also means the desktop talks straight to
the provider's domain, and that domain is in the renderer's CSP. Moving this
behind the relay later removes that CSP entry and the CORS dependency.
