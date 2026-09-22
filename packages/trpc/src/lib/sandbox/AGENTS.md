# Cloud workspace sandboxes

This directory provisions and bootstraps the Vercel sandboxes that back cloud
workspaces, and mints the tickets clients present at the sandbox gate
(`access.ts`). The gate itself is the Worker in `apps/gate`; the desktop half
lives in `apps/desktop/src/renderer` (the sidebar's cloud section,
`SandboxAccessProvider`, the host fan-out); host-service inside the sandbox
checks the secret the gate presents with the same `PskHostAuthProvider` a
local host uses; and the image and bundle are `packages/sandbox` — a change here
usually needs one of those too. `docs/cloud-sandbox-acceptance.md` is what to
run afterwards.

**Read `docs/cloud-sandbox-mismatches.md` before changing anything in here.**
It is the list of places where a sandbox doesn't behave like the machine the
app was written for: who owns a workspace's name, the fabricated project and
workspace rows, brokered addresses that expire, terminals with no login shell,
credentials that only exist at the egress firewall.

**Add to that list when you find a new one.** Anything that made you say "of
course, a sandbox doesn't have that" belongs in it, including the ones you fixed
quickly — the cost of these is that they are invisible until they aren't, and a
five-minute workaround you don't write down is a five-hour debugging session for
whoever meets it next. Follow the existing shape: what the app assumes, what a
sandbox actually is, what we did about it, and mark it **Open** if we didn't.

Two habits that pay for themselves here:

- **Verify from the renderer, not from Node.** The renderer's CSP and the
  WebSocket auth sit between the app and a sandbox, and both fail as a generic
  `TypeError: Failed to fetch`. A script that succeeds from your terminal proves
  nothing about the app.
- **A host-service change reaches a box only through a release.** host-service
  is an asset row in `packages/sandbox/bundle/assets.json` that `bun run
  release` rewrites (and `bun run assets host-service` by hand); a merge to
  main changes nothing on any box. A fix that isn't in a published bundle is
  a fix that only exists on your machine.
- **The claim is the whole handoff.** `buildSandboxClaim` assembles what a box
  needs to be one workspace — the identity file, the firewall rules, the
  managed environment, the host secret — and `provisionSandbox`, `wakeSandbox`
  and `promoteSandboxToEnvironment` all take it, so a create, a wake and a
  restart after promote hand the box the same thing.

`docs/cloud-sandbox-considerations.md` is the companion list: what we still owe
before a non-internal user can create a sandbox. Several entries there are only
acceptable because of the `@superset.sh` gate — if you touch that gate, read it.
