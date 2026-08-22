# Cloud workspace sandboxes

This directory provisions and bootstraps the sandboxes that back cloud
workspaces. The desktop half lives in `apps/desktop/src/renderer` (the sidebar's
cloud section, `SandboxAccessProvider`, the host fan-out) and the image in
`scripts/sandbox/image.ts` — a change here usually needs one of those too.

**Read `docs/cloud-sandbox-mismatches.md` before changing anything in here.**
It is the list of places where a sandbox doesn't behave like the machine the
app was written for: who owns a workspace's name, the fabricated project and
workspace rows, brokered addresses that expire, terminals with no login shell,
credentials that only exist at the provider's edge.

**Add to that list when you find a new one.** Anything that made you say "of
course, a sandbox doesn't have that" belongs in it, including the ones you fixed
quickly — the cost of these is that they are invisible until they aren't, and a
five-minute workaround you don't write down is a five-hour debugging session for
whoever meets it next. Follow the existing shape: what the app assumes, what a
sandbox actually is, what we did about it, and mark it **Open** if we didn't.

Two habits that pay for themselves here:

- **Verify from the renderer, not from Node.** CSP, CORS and WebSocket auth all
  sit between the app and a sandbox, and all three fail as a generic
  `TypeError: Failed to fetch`. A script that succeeds from your terminal proves
  nothing about the app.
- **Rebuild the image when host-service changes.** The image ships
  `packages/host-service/dist`; a fix that isn't rebuilt into it is a fix that
  only exists on your machine.

`docs/cloud-sandbox-considerations.md` is the companion list: what we still owe
before a non-internal user can create a sandbox. Several entries there are only
acceptable because of the `@superset.sh` gate — if you touch that gate, read it.
