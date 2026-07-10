# Headless Host Registration Fixes

Running the host-service on a headless machine (sandbox, CI, server) via API key
is effectively broken. Diagnosed end-to-end while bringing a Sprites.dev sandbox
online: the daemon runs, mints a JWT, connects the relay — then flaps
`1008 Forbidden` and never surfaces in `hosts list`. **Three** independent bugs,
each with a clear fix. Fix them together.

The `1008 Forbidden` we chased was **wrong-org (Bug 2) stacked on the old
`paidPlan` gate** (removed by #5571) — *not* a missing claim step. A headless
host claims itself; see "Bug 4 was a misdiagnosis" below.

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

**Fix:** fold the env read into `resolveAuth`'s override tier (`resolve-auth.ts`):
`apiKeyOption?.trim() || process.env.SUPERSET_API_KEY?.trim()`. Precedence becomes
`--api-key` → env → `config.apiKey` → OAuth — exactly what the help text and
`whoami` already claim, centralized where the ladder already lives and is tested.
Now the docs are true.

## Bug 2 — `superset start` has no org selection (uses active org)

- `packages/cli/src/commands/start/command.ts:15` — org comes from
  `ctx.api.user.myOrganization.query()`, the *active* org. No `--org`.

Symptom: a user in multiple orgs registers the host under whichever org is
"active" (often the wrong one). We hit exactly this: host registered under the
**unpaid** org `803f13a4` instead of the **paid** org `a1b2c3d4` → relay Forbidden.
There is no flag to choose.

**Fix:** add `--org <id|slug|name>` to `start`. Swap `user.myOrganization` →
`user.myOrganizations` (already exists, returns the full list) and branch:
- `--org` set → resolve by id/slug/name; error listing memberships on no match.
- exactly one membership → use it (today's behavior).
- multiple + **TTY** → `p.select(...)` to pick (default-highlight active org).
- multiple + **non-TTY** (agent/CI) → `CLIError` listing orgs + "pass `--org`".
  Never silently guess — that guess is exactly what registered the sprite under
  the wrong org.

## Bug 3 — relay `1008 Forbidden` is opaque (hides the real reason)

- `apps/relay/src/access.ts:40` — now `const ok = result.allowed;` (the
  `&& result.paidPlan` gate was removed by **#5571 "allow free plans to use the
  relay"**, merged in). So the *paid-plan* blocker is gone; the remaining gate is
  `allowed`, which is false until the host is claimed (Bug 4).
- `apps/relay/src/index.ts:262` — `ws.close(1008, "Forbidden")` with no detail.

Symptom: the daemon logs a bare `relay rejected connection (code=1008,
reason=Forbidden)`. The real cause (not in org / host not claimed) is invisible.
This single opaque line cost hours.

**Fix:** `checkHostAccess` returns a reason union (`not_in_org` | `not_registered`)
instead of a bare bool; `index.ts` maps it to a descriptive close frame (under the
123-byte WS limit): `"Forbidden: not a member of this org"` /
`"Forbidden: host not registered to this account"`. `tunnel-client.ts:133` already
logs `event.reason`, so no host-side change is needed. No secrets leaked — these
are the user's own memberships.

## Bug 4 was a misdiagnosis — a headless host claims itself

There is **no claim step and no `isClaimed`/`claimedBy` column**. `host.ensure`
(host.ts:108-124) auto-inserts a `v2UsersHosts` **owner** row on first
registration when `createdByUserId === ctx.userId`. `checkAccess`'s
`allowed = !!row` is simply "does that user↔host link exist." So a headless host
registered via API key is *already owned* by the key's user the moment `ensure`
runs (called from `connectRelay`, connect.ts:20).

The `allowed:false` we saw under the paid org was Bug 2 (the host was registered
under the *other* org, where it was `allowed:true`), and the only reason that org
still got Forbidden was the old `paidPlan` gate — removed by #5571. So after this
merge the sprite host as-registered should already pass the relay.

**Residual edge (not fixed, rare):** if a `machineId` collides with a host a
*different* user already created, `ensure`'s `onConflictDoNothing` means the new
user is never linked → `allowed:false` with no recourse. Not the headless story;
note only.

## Acceptance

On a fresh headless box:
```
SUPERSET_API_KEY=sk_live_… superset start --daemon --org <org>
```
→ host registers (self-owned), relay accepts (no Forbidden), and it shows
**online + named** in `superset hosts list` and desktop — with **no desktop
interaction required**.

## Already fixed upstream

- **#5571 "allow free plans to use the relay"** removed the `paidPlan` gate from
  `access.ts` — free/unpaid orgs can now use the relay. Merged into this branch.
