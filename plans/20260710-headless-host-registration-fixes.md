# Headless Host Registration Fixes

Running the host-service on a headless machine (sandbox, CI, server) via API key
is effectively broken. Diagnosed end-to-end while bringing a Sprites.dev sandbox
online: the daemon runs, mints a JWT, connects the relay — then flaps
`1008 Forbidden` and never surfaces in `hosts list`. Four independent bugs, each
with a clear fix. Fix them together.

## The flow (for reference)

`superset start` → `middleware.ts` `resolveAuth` → `spawnHostService` →
host-service mints a JWT (`JwtAuthProvider`) → opens relay tunnel → relay
`checkHostAccess` gates on `allowed && paidPlan`.

## Bug 1 — `SUPERSET_API_KEY` env is documented but never read

The help text and error hints claim the env var works, but no code reads it.

- `packages/cli/src/commands/middleware.ts:7` — `resolveAuth(options.apiKey)`
  passes only the `--api-key` flag.
- `packages/cli/src/lib/resolve-auth.ts:22-30` — resolves `apiKeyOption` →
  `config.apiKey` → OAuth session. Never touches `process.env`.
- False promises: `resolve-auth.ts:60` and `commands/auth/whoami/command.ts:15`
  both say "SUPERSET_API_KEY env".

Symptom: `SUPERSET_API_KEY=… superset start` silently ignores the key → mints with
no token → `Failed to mint JWT: 401`. (Worked only when passed as `--api-key`.)

**Fix:** in `middleware.ts`, `resolveAuth(options.apiKey ?? process.env.SUPERSET_API_KEY)`.
Add a test. Now the docs are true.

## Bug 2 — `superset start` has no org selection (uses active org)

- `packages/cli/src/commands/start/command.ts:15` — org comes from
  `ctx.api.user.myOrganization.query()`, the *active* org. No `--org`.

Symptom: a user in multiple orgs registers the host under whichever org is
"active" (often the wrong one). We hit exactly this: host registered under the
**unpaid** org `803f13a4` instead of the **paid** org `a1b2c3d4` → relay Forbidden.
There is no flag to choose.

**Fix:** add `--org <id|slug>` to `start`; when set, use it for `spawnHostService`'s
`organizationId` and the api client. Optionally: if the active org fails the paid
check but another membership passes, hint at `--org`.

## Bug 3 — relay `1008 Forbidden` is opaque (hides the real reason)

- `apps/relay/src/access.ts:40` — now `const ok = result.allowed;` (the
  `&& result.paidPlan` gate was removed by **#5571 "allow free plans to use the
  relay"**, merged in). So the *paid-plan* blocker is gone; the remaining gate is
  `allowed`, which is false until the host is claimed (Bug 4).
- `apps/relay/src/index.ts:262` — `ws.close(1008, "Forbidden")` with no detail.

Symptom: the daemon logs a bare `relay rejected connection (code=1008,
reason=Forbidden)`. The real cause (not in org / host not claimed) is invisible.
This single opaque line cost hours.

**Fix:** carry a reason from `checkHostAccess` (`not_in_org` | `not_allowed`)
into the close reason, and have `tunnel-client` log it plainly (e.g. "relay
denied: host not yet claimed — open it in the desktop app or run `superset hosts
claim`"). No secrets leaked — these are the user's own memberships.

## Bug 4 — a headless host stays unclaimed forever (no CLI path)

Even correctly authed under the paid org, `host.checkAccess` returns
`allowed:false` with `hostName:null` — a self-registered host is *registered but
not claimed*. It only becomes `allowed` when a user opens/claims it from the
**desktop** app. There is no CLI equivalent (`superset hosts` = list/set-wake/wake).

Symptom: a purely headless host can never come fully online — it always needs a
human on desktop. Breaks the documented "remote workspaces on a server" story.

**Fix (pick one):**
- Auto-claim a self-registered host when it authenticates with a valid org
  credential (the key already proves org membership), **or**
- add `superset hosts claim <id>` / `--claim` on `start`.

## Acceptance

On a fresh headless box in a paid org:
```
SUPERSET_API_KEY=sk_live_… superset start --daemon --org <paid-org>
```
→ host registers, relay accepts (no Forbidden), and it shows **online + named** in
`superset hosts list` and desktop — with **no desktop interaction required**.

## Already fixed upstream

- **#5571 "allow free plans to use the relay"** removed the `paidPlan` gate from
  `access.ts` — free/unpaid orgs can now use the relay. Merged into this branch.
  The remaining live blocker for a headless host is Bug 4 (`allowed:false` until
  claimed), not billing.
