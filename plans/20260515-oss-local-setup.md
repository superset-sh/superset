# OSS Local Setup — What Shipped + What's Left

This was originally a forward-looking plan; now it's a record of what was actually built, verified, and what's still loose. Contributor-facing setup instructions live in `docs/LOCAL_DEVELOPMENT.md`.

## Status

A fresh-clone contributor can:

1. `git clone … && cd superset && bun install`
2. Start a local Postgres container with `wal_level=logical` on host port 5433
3. Run `bun run db:migrate` to apply schema
4. `SKIP_ENV_VALIDATION=1 bun dev`

…and have a working web + API + Electric + electric-proxy + Caddy + desktop stack, signed in as a seed admin, with the host-service spawned and reachable. **Verified end-to-end via CDP** (Chrome DevTools Protocol probing the Electron renderer at port 9333) — the React context for `LocalHostServiceContext` reports `activeHostUrl: "http://127.0.0.1:<port>"`, so the "Host service not available" gate is open.

## What was built (with file paths)

### Database

- **`packages/db/src/client.ts`** — driver swap: detects non-Neon `DATABASE_URL` and uses Drizzle's `node-postgres` adapter via `pg.Pool` instead of `@neondatabase/serverless`. ~20 LOC.
- **`packages/db/package.json`** — adds `pg` + `@types/pg`.
- **`drizzle-kit migrate`** is the right command against a fresh DB. `drizzle-kit push` has multi-schema ordering issues against a vanilla Postgres; `migrate` applies committed `.sql` files in order and just works.

### Auth

- **`packages/auth/src/server.ts`** — added `emailAndPassword: { enabled: true, autoSignIn: true }`. OAuth providers (Google, GitHub) still register conditionally based on their `*_CLIENT_ID` env vars; Better Auth itself logs a warning when those are missing — no crash.
- **`packages/auth/src/lib/resend.ts`** — lazy-init + console-log fallback when `RESEND_API_KEY` is empty. Better Auth's `sendEmail` hook calls this; in dev with no key, emails are logged to the terminal.
- **`packages/auth/src/stripe.ts`** — `Proxy` lazy-init; throws "Stripe not configured" only if a billing operation is actually exercised.

### Telemetry / analytics

- **`apps/api/src/lib/analytics.ts`** + **`packages/trpc/src/lib/analytics.ts`** — PostHog `Proxy` lazy-init; returns a no-op surface (`capture`, `getFeatureFlag`, etc. all no-op) when `NEXT_PUBLIC_POSTHOG_KEY` is empty. Previously crashed at module load.

### Other lazy-init guards

- **`packages/trpc/src/router/support/support.ts`** — Resend `Proxy` lazy-init.

### Dev auto-sign-in (the cleanest part)

- **`apps/desktop/src/main/lib/dev-auto-sign-in.ts`** — new file. During `app.whenReady()`, if `SKIP_ENV_VALIDATION` is set and no token is on disk, POSTs to `/api/auth/sign-in/email` (auto-signs-up the seed user if needed), then calls `saveToken()` to write `auth-token.enc`. The renderer's `AuthProvider` is **untouched** — it hydrates from disk like a real OAuth user.
- **`apps/desktop/src/main/index.ts`** — calls `ensureDevAuthToken()` after `app.whenReady()`, before host-service discovery. Also enables Chrome DevTools Protocol on `localhost:9333` in dev for headless testing.
- **`packages/db/src/seed-dev.ts`** — `bun db:seed:dev` script. POSTs to the API to create `admin@local.test / supersetdev`. Refuses to run if `NODE_ENV === "production"` or `DATABASE_URL` hostname isn't localhost. Idempotent.

### Renderer org-id priority fix (the actual host-service bug)

- 16 files under `apps/desktop/src/renderer/routes/_authenticated/`, plus `routes/sign-in/page.tsx`. The original pattern was `env.SKIP_ENV_VALIDATION ? MOCK_ORG_ID : session.activeOrganizationId`, which forced the renderer to use a fake org ID even when a real session was present. With dev auto-sign-in producing a real session, the renderer was looking up the host-service by `MOCK_ORG_ID` while the host-service had spawned for the real org — connection lookup returned undefined, "Host service not available" toast fired.
- Flipped to `session.activeOrganizationId ?? (SKIP_ENV_VALIDATION ? MOCK_ORG_ID : null)` — prefer real session, fall back to mock only without one. Verified via CDP that `activeHostUrl` is now populated.

### Dev UI

- **`apps/web/src/app/(auth)/components/DevAuthForm/`** — email/password form rendered on the web app's sign-in and sign-up pages, gated `process.env.NODE_ENV !== "production"`. Prefilled with the seed credentials. Same `authClient.signIn.email` underneath.
- **`apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`** + **`sign-up/[[...sign-up]]/page.tsx`** — wire the form.

### Plumbing

- **`turbo.jsonc`** — added `SKIP_ENV_VALIDATION` to `globalPassThroughEnv` so the flag reaches every dev subtask.
- **`package.json`** — added `bun db:seed:dev` root script.

### Production safety

- The dev auto-sign-in module checks `mainEnv.SKIP_ENV_VALIDATION` (which is itself gated to `NODE_ENV === "development"` in `apps/desktop/src/main/env.main.ts`). It cannot run in a production build.
- `db:seed:dev` refuses to run against non-localhost DBs and in production.
- The DevAuthForm only renders when `NODE_ENV !== "production"`.
- The Chrome DevTools Protocol port (9333) only opens when both `IS_DEV` and `SKIP_ENV_VALIDATION` are set.

## Deployment profiles (the key abstraction)

`packages/shared/src/deployment-profile.ts` exposes a four-profile model:

| Profile | Trigger | Validation |
|---|---|---|
| `cloud` | `VERCEL=1` (set automatically at runtime on Vercel) | Strict — every integration key required |
| `oss-dev` | `SUPERSET_OSS=1` | Lenient — integration keys optional, features degrade |
| `ci` | `CI=true` (set automatically by GitHub Actions / most CI runners) | Lenient — lint/typecheck/test don't have integration keys |
| `internal` | default | Strict — covers internal team dev + self-hosted prod |

All env schemas (`apps/api/src/env.ts`, `packages/trpc/src/env.ts`, `apps/web/src/env.ts`, etc.) compute their `skipValidation` from this:

```ts
const skipValidation = !isStrictProfile(getDeploymentProfile()) || !!process.env.SKIP_ENV_VALIDATION;
```

OSS contributors: set `SUPERSET_OSS=1` once → validation skipped → boot with whatever's in `.env`, lazy guards catch the crashes.
Internal devs: nothing changes → validation runs → fail-fast on missing keys, exactly today's experience.
Cloud (Vercel): same as before, strict enforcement of all keys.
Self-hosted: defaults to strict — operators get a loud error if they miss something.

**Strict-by-default** is the conservative direction:
- Internal devs and self-hosters keep their fail-fast workflow with zero changes to setup or shell config.
- An internal dev who accidentally drops their `.env` gets the same loud error they get today.
- An OSS contributor only has to type one flag (`SUPERSET_OSS=1`) — and gets explicit "you're in lenient mode" feedback via the boot summary.

`SKIP_ENV_VALIDATION=1` remains the build-time escape hatch (e.g. Docker preview builds), routed through `turbo.jsonc`'s `globalPassThroughEnv`. Not the primary discriminator.

### Boot-time visibility

`apps/api/src/lib/boot-summary.ts` prints a one-time summary at API startup listing every disabled integration:

```
[superset] profile=oss-dev (lenient)
[superset] disabled features (set the listed env var to enable):
           - stripe                       STRIPE_SECRET_KEY
           - resend (email)               RESEND_API_KEY
           - ...
```

In strict profiles it just prints `profile=cloud (strict)` (env validation already failed boot if anything's missing).

### `/api/health` endpoint

`apps/api/src/app/api/health/route.ts` returns:

```json
{ "ok": true, "profile": "oss-dev", "integrations": { "stripe": "missing", ... } }
```

Used for: contributor sanity checks, prod monitoring alerts on unexpected gaps.

## What's NOT built (originally in plan, deferred)

These were in the original plan but aren't necessary for "fresh clone boots" and were left for follow-up:

- **`docker-compose.dev.yml`** — currently contributors run a one-liner `docker run`. A compose file with Postgres + Mailpit would be nicer; for now, the README's short instructions are enough.
- **`.env.example` rewrite with working defaults** — `.env.example` is still mostly blank. The docs tell contributors to set just `DATABASE_URL` and `BETTER_AUTH_SECRET`.
- **`bun setup` orchestrator** — the discrete steps (`docker run`, `bun install`, `bun run db:migrate`, `bun dev`) are still manual. Wrapping them in `bun setup` would be a small ergonomics win.
- **Per-integration group `.refine()`** — e.g. if `STRIPE_SECRET_KEY` is set then `STRIPE_WEBHOOK_SECRET` must also be set. Catches half-configured prod deploys. Not built; deferred until someone hits the failure mode.
- **CI fresh-clone smoke test** — not built. Without it, the OSS path can rot silently if someone adds a new crash-on-import integration.
- **Email provider abstraction (Mailpit fallback)** — Better Auth's `sendEmail` hook currently just `console.log`s emails when no `RESEND_API_KEY` is present. Mailpit container would be nicer UX (clickable links in a web UI) but isn't blocking.
- **Local-disk Blob storage fallback** — not built. Upload features that need `BLOB_READ_WRITE_TOKEN` will throw.
- **In-memory rate-limit fallback** — not built. Upstash KV is already handled gracefully by the SDK (logs warnings on missing keys).
- **Full integration crash audit** — Stripe, Resend, PostHog, and `packages/trpc/src/router/support` were wrapped with lazy-init. GitHub App, Freestyle, Linear, Slack, QStash signing keys, Anthropic, Blob may still crash-on-import in oss-dev. Need a survey: `grep -rn "new \w\+(.*env\." packages apps`.

## What was learned vs. the original plan

- **`neondatabase/neon_local` is not a Neon protocol emulator.** It requires `NEON_PROJECT_ID` + `NEON_API_KEY` and proxies to a real Neon project. Useless for OSS. Plain `postgres:16 -c wal_level=logical` is the right substrate, with the driver swap above.
- **`@neondatabase/serverless` cannot speak vanilla Postgres TCP.** The driver swap is unavoidable — it's not a config flag.
- **Most integrations degrade gracefully on their own.** Better Auth social providers, Upstash KV, QStash all log warnings when their env vars are missing and keep working. Only a handful crash at import: Resend, Stripe, PostHog, GitHub App in some paths. Plan's "guard a dozen integrations" overestimated; reality was 3-4.
- **The right place for dev auto-sign-in is the main process, not the renderer.** Initial attempt put it in the renderer's `AuthProvider`, which mixed dev seed concerns with prod auth hydration. Moving it to a `app.whenReady()` hook (where token encryption already lives) leaves `AuthProvider` 100% upstream-pure and gives a much cleaner failure mode.
- **The renderer had a dev-mode landmine:** 16 places overrode `activeOrganizationId` to `MOCK_ORG_ID` when `SKIP_ENV_VALIDATION` was set. That was a legacy hack from before there was a real dev session. The real fix isn't extra dev logic — it's flipping the priority to prefer whichever session is present. New code that needs `activeOrganizationId` should follow this same pattern.

## Architecture summary

```
Contributor's machine
├─ Docker
│  ├─ superset-pg            postgres:16, port 5433, wal_level=logical
│  └─ superset-electric-…    electricsql/electric:1.4.13, port 4649
│                            (replicates from superset-pg via host.docker.internal)
└─ SKIP_ENV_VALIDATION=1 bun dev
   ├─ apps/web               :4640   (Next.js, dev-only email+password form)
   ├─ apps/api               :4641   (Next.js, Better Auth + tRPC)
   ├─ apps/desktop (Electron):4645   (Vite renderer + Electron main)
   │  ├─ main process boots
   │  ├─ ensureDevAuthToken() POSTs sign-in to :4641 → saveToken()
   │  ├─ host-service spawns per-org on a dynamic port (e.g. 59728)
   │  └─ renderer hydrates from auth-token.enc, looks up activeHostUrl
   ├─ electric-proxy (Wrangler) :4652
   └─ Caddy HTTPS proxy      :4650 → electric-proxy (HTTP/2 for SSE)
```

## Verification protocol

CDP probe to confirm the host-service connection is live:

```bash
curl -sS http://localhost:9333/json/list | jq '.[] | select(.type=="page") | .webSocketDebuggerUrl'
# Connect via WS, eval:
#   walkFibersForContextValue() → { activeHostUrl: "http://127.0.0.1:<port>", machineId: "…" }
```

Concrete script lives in tmp scripts (`/tmp/cdp-find-hosturl.mjs`) used during development.
