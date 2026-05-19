# OSS Local Setup — Complete Record

Authoritative design record for PR [#4616](https://github.com/superset-sh/superset/pull/4616). Contributor-facing setup instructions live in [docs/LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md).

## Goal

A contributor cloning Superset from GitHub can boot the full web + API + Electric + electric-proxy + Caddy + desktop stack against a local Postgres in Docker, **without Neon, OAuth, Stripe, Resend, GitHub App, Linear, Slack, QStash, Upstash, PostHog, Sentry, Freestyle, or any other cloud-service credentials**. The internal team's fail-fast workflow stays unchanged, and production stays strictly validated.

## Requirements

Three audiences with different expectations:

1. **OSS contributor (fresh GitHub clone)**
   - Has Docker + Bun, nothing else
   - Wants `git clone && SUPERSET_PROFILE=local bun dev` to land them in a working app, signed in
   - Features that need cloud keys should degrade visibly, never crash boot
   - Must not silently sync against hosted production endpoints

2. **Internal team dev (existing workflow)**
   - Uses `.superset/setup.sh` to provision per-worktree Neon branches + real cloud keys
   - Same fail-fast behavior they have today on missing keys
   - No new flags to type, no shell-config changes, no documentation to memorize

3. **Production (Vercel + self-host)**
   - Strict env validation: missing required key → deploy fails before serving traffic
   - All visibility/observability surfaces report what's actually configured

## Final design — four deployment profiles

`packages/shared/src/deployment-profile.ts`:

| Profile     | Trigger                                  | Validation | Notes |
|-------------|------------------------------------------|------------|-------|
| `cloud`     | `VERCEL=1` or `VERCEL_ENV` (set by Vercel) | Strict     | Vercel deploy/build context |
| `local`     | `SUPERSET_PROFILE=local`                 | Lenient    | Explicit local contributor opt-in |
| `ci`        | `CI=true` (auto by GH Actions et al.)    | Lenient    | Build/lint/test don't need prod secrets |
| `internal`  | default                                  | Strict     | Covers internal team dev + self-hosted prod |

Resolution order in `getDeploymentProfile()` (most-trusted wins):

```ts
if (env.VERCEL === "1" || env.VERCEL_ENV) return "cloud";
if (env.SUPERSET_PROFILE === "local") return "local";
if (env.CI === "true")         return "ci";
return "internal";
```

Each env schema (`apps/api`, `apps/web`, `apps/admin`, `apps/marketing`, `apps/docs`, `apps/relay`, `apps/desktop/src/main/env.main`, `packages/trpc`) computes:

```ts
const skipValidation = shouldSkipEnvValidation();
```

`SKIP_ENV_VALIDATION=1` remains a build-time escape hatch (Docker preview builds, etc.) — not the primary discriminator.

## What's wired

### Database layer

- **`packages/db/src/client.ts`** — driver swap. Detects non-Neon `DATABASE_URL` (regex on `*.neon.tech` / `*.neon.build`) and uses `drizzle-orm/node-postgres` with `pg.Pool` instead of `@neondatabase/serverless`. The Neon driver only speaks Neon's HTTP/WS protocol, not vanilla Postgres TCP.
- **`packages/db/src/seed-dev.ts`** — `bun db:seed:dev` script. POSTs to `/api/auth/sign-up/email` to create `admin@local.test / supersetdev`. Refuses to run in production or against non-localhost `DATABASE_URL`. Idempotent.
- **`docker-compose.dev.yml`** — Postgres 16 with `wal_level=logical` on host port 5433, Electric SQL 1.4.13 on host port 4649 reading from the Postgres above via `host.docker.internal`. Health-checked.

### Auth

- **`packages/auth/src/server.ts`** — `emailAndPassword: { enabled: NODE_ENV !== "production", autoSignIn: true }`. Direct credential endpoints removed in prod builds. `afterCreateOrganization` hook gates Stripe customer creation on `env.STRIPE_SECRET_KEY` presence; `seedDefaultStatuses` always runs so OSS users complete org provisioning cleanly. OAuth providers register conditionally on their `*_CLIENT_ID`.
- **`packages/auth/src/lib/resend.ts`** — `Proxy` lazy-init with batch + emails console fallback when `RESEND_API_KEY` empty. Better Auth's `sendEmail` hook writes to terminal instead of crashing.
- **`packages/auth/src/stripe.ts`** — `Proxy` lazy-init. Throws "Stripe not configured" only when a billing operation is exercised.
- **`packages/trpc/src/router/support/support.ts`** — same lazy-init Proxy pattern for the support email path.

### Desktop main process

- **`apps/desktop/src/main/lib/dev-auto-sign-in.ts`** — fired once during `app.whenReady()` when `isLocalProfile()` is true. Polls `/api/auth/ok` with 1s interval × 60s timeout (auto-sign-in survives the race against API startup), then POSTs to `/api/auth/sign-in/email` (auto-signs-up the seed user if missing). Persists the token via the same `saveToken()` that OAuth uses. Renderer stays prod-pure.
- **`apps/desktop/src/main/index.ts`** — calls `void ensureDevAuthToken()` (fire-and-forget) so the window opens immediately. `AuthProvider`'s `onTokenChanged` subscription re-hydrates when the token lands. Also exposes Chrome DevTools Protocol on `localhost:9333` in the local profile for headless verification.
- **`apps/desktop/src/main/env.main.ts`** — env defaults switch to localhost in dev builds (`NODE_ENV=development`) so a fresh-clone session never silently points main-process clients at hosted production. Profile check inlined here (rather than imported from `@superset/shared`) because `electron.vite.config.ts` does `await import("./src/main/env.main")` at config-load time using Node's ESM loader, which can't transform `.ts` files from sibling workspace packages.

### Desktop renderer

- **`apps/desktop/src/renderer/env.renderer.ts`** — env defaults switch to localhost in dev builds for `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_ELECTRIC_URL`, `RELAY_URL`. Fresh-clone renderer never syncs against hosted Electric.
- **`apps/desktop/src/renderer/routes/_authenticated/.../*`** (16 files) — flipped `env.SKIP_ENV_VALIDATION ? MOCK_ORG_ID : session.activeOrganizationId` to `session.activeOrganizationId ?? (env.SKIP_ENV_VALIDATION ? MOCK_ORG_ID : null)`. Prefer real session, fall back to mock only when there is no session. Fixed the "Host service not available" toast caused by the renderer querying host-service by the fake org ID while host-service spawned for the real auto-signed-in admin org.

### Build pipeline

- **`apps/desktop/electron.vite.config.ts`** + **`apps/desktop/vite/helpers.ts`** — added `devOrProdUrl()` helper that returns `process.env[key]` if set, else a dev-vs-prod fallback based on `NODE_ENV`. Used in `define` blocks for main + renderer `process.env` replacements and in `htmlEnvTransformPlugin` for `%NEXT_PUBLIC_*%` placeholders in `index.html`. Builds default to localhost-friendly URLs in dev mode.

### Web app

- **`apps/web/src/app/(auth)/components/DevAuthForm/`** — email/password form, gated `NODE_ENV !== "production"`. Prefilled with seed credentials so contributors click "Sign in" once.
- **`apps/web/src/app/(auth)/sign-in/.../page.tsx`** + **`sign-up/.../page.tsx`** — wire the form.

### Telemetry / observability

- **`apps/api/src/lib/analytics.ts`** + **`packages/trpc/src/lib/analytics.ts`** — PostHog `Proxy` lazy-init returning a no-op surface (`capture`, `getFeatureFlag`, etc.) when `NEXT_PUBLIC_POSTHOG_KEY` is missing.
- **`apps/api/src/lib/boot-summary.ts`** — one-time API startup log printing every disabled integration and the env var to enable it. Visible to contributors so degradation is never silent.
- **`apps/api/src/app/api/health/route.ts`** — `GET /api/health` returns `{ ok, profile, integrations: { stripe: "configured" | "missing", … } }` for prod monitoring + contributor sanity checks.

### Plumbing

- **`turbo.jsonc`** — `SUPERSET_PROFILE`, `CI`, `VERCEL`, `VERCEL_ENV`, and `SKIP_ENV_VALIDATION` live in `globalEnv`. Profile-affecting flags now hash into the cache key so strict/lenient cached builds can't cross-contaminate.
- **`package.json`** — `bun db:seed:dev` root script.

### Docs

- **`docs/LOCAL_DEVELOPMENT.md`** — contributor-facing setup guide.
- **`README.md`** — `Build from Source` section shrunk to a 6-line quickstart, pointed at `docs/LOCAL_DEVELOPMENT.md`.

## Decisions made (with rejected alternatives)

### Why profile-aware `skipValidation` instead of marking ~70 integration vars `.optional()` everywhere?

**Rejected:** Mark each integration key `.optional()`, fix every consumer that types it as `string`. The "Formbricks pattern."

**Chosen:** Keep schemas as-is, flip `skipValidation` based on profile. Lazy guards at call sites catch the crashes.

**Why:** The Formbricks refactor would touch ~70 schema entries and ~100+ consumer sites that assume non-null. The skipValidation approach is one line per env file, no consumer changes, and the runtime behavior is identical: in OSS, the env object has whatever's in `process.env` (possibly empty strings); call sites that crash get wrapped in lazy guards as discovered.

### Why strict-by-default with `SUPERSET_PROFILE=local` opt-in, not lenient-by-default with `SUPERSET_INTERNAL_DEV=1` opt-in?

**Rejected:** Default to lenient + write `SUPERSET_INTERNAL_DEV=1` from `.superset/setup.sh` so internal devs land in strict.

**Chosen:** Default to strict + local contributors set `SUPERSET_PROFILE=local`.

**Why:** Strict-by-default is the conservative direction. An internal dev or self-hoster who forgets to source their `.env` gets a clear failure, not a silently-degraded app. OSS contributors trade a one-time flag for that safety guarantee. Also: no setup-script edit means internal devs' workflow is byte-identical to today.

### Why not gate on `NODE_ENV === "production"` instead of Vercel env markers?

**Rejected:** Use `NODE_ENV === "production"` as the cloud discriminator.

**Chosen:** `VERCEL=1` or `VERCEL_ENV` for cloud, `NODE_ENV` only as a fallback indicator inside the `internal` default.

**Why:** `NODE_ENV=production` is true in self-hosted dev too — it conflates "deployed to Vercel" with "operator running the production build locally." Self-hosters are legitimate prod operators and we want them strict, but they have different keys than Vercel (no `VERCEL_*` vars, no Vercel-specific URLs). Discriminating on Vercel env markers keeps cloud and self-hosted as two distinct strict-validated buckets.

### Why a `ci` profile when `SKIP_ENV_VALIDATION=1` already exists?

**Rejected:** Have CI workflows explicitly set `SKIP_ENV_VALIDATION=1` for lint/typecheck/test jobs.

**Chosen:** Auto-detect `CI=true` (set by GitHub Actions and most CI runners) and treat as lenient.

**Why:** Zero-config — existing workflows don't need to add env vars. And the profile is reported correctly in the boot summary + `/api/health`, so it's clear in logs that the build is lenient. `SKIP_ENV_VALIDATION=1` remains the explicit one-off escape hatch.

### Why move profile-affecting flags from `globalPassThroughEnv` to `globalEnv`?

**Rejected:** Pass-through (cheap, no cache invalidation).

**Chosen:** Hash into the cache key.

**Why:** A `bun run build` cached with `SUPERSET_PROFILE=local` (validation skipped) could be served back when the next caller doesn't have the flag (validation expected). Same for `CI=true` vs not. Caches that disagree about validation produce bugs that are very hard to attribute. Cache invalidation cost is acceptable — these flags don't flip often.

### Why dev auto-sign-in in the main process, not the renderer?

**Initial attempt:** Put it in `AuthProvider` (renderer).

**Rejected because:** Mixes dev seed concerns with prod auth hydration. `AuthProvider` becomes "auth + dev seeding." Race conditions with React render lifecycle. Easy to accidentally ship to prod bundles.

**Chosen:** Main process during `app.whenReady()`. Uses the same `saveToken()` OAuth uses. Renderer is 100% upstream-pure — has no idea dev mode exists.

### Why fire-and-forget instead of blocking window creation on auto-sign-in?

**Initial attempt:** `await ensureDevAuthToken()` before `MainWindow()`.

**Rejected because:** If the API takes 30s to compile on first launch, the desktop window is blank for 30s with no feedback. Bad UX.

**Chosen:** `void ensureDevAuthToken()` — window opens immediately. The function polls `/api/auth/ok` internally with backoff. `AuthProvider.onTokenChanged` subscription picks up the token whenever it eventually lands and re-hydrates the renderer's session.

### Why inline the profile check in `env.main.ts` instead of importing from `@superset/shared`?

**Rejected:** Single canonical import.

**Chosen:** Inline the four-line check in `env.main.ts` only; other consumers import from `@superset/shared/deployment-profile`.

**Why:** `electron.vite.config.ts` does `await import("./src/main/env.main")` at config-load time to validate env at build. Node's native ESM loader handles that import — it has no Vite/SWC/TS transform — so any transitive `.ts` import from a sibling workspace package fails with `ERR_UNKNOWN_FILE_EXTENSION`. Discovered the hard way when CI build failed. The four lines of duplication are a fair trade for not breaking the build.

## Lessons learned

### `neondatabase/neon_local` is not a Neon protocol emulator

It requires `NEON_PROJECT_ID` + `NEON_API_KEY` and acts as a *proxy* to a real Neon project. Useless for OSS. We discovered this only by running it. Plain `postgres:16 -c wal_level=logical` is the right substrate; pair it with a driver swap.

### `@neondatabase/serverless` cannot speak vanilla Postgres TCP

The serverless driver only knows Neon's HTTP/WS protocol. Verified by running it against a local Postgres — fails with "Unable to connect." Driver swap is unavoidable (~20 LOC), not a config flag.

### Most integrations degrade gracefully on their own

Better Auth social providers, Upstash KV, QStash all log warnings on missing keys and keep working. Only **Stripe, Resend, PostHog, and the trpc support router** crashed at module load. The plan's "guard a dozen integrations" overestimated; actual scope was 4 files.

### The renderer had a hidden dev-mode landmine

16 places overrode `activeOrganizationId` to `MOCK_ORG_ID` whenever `SKIP_ENV_VALIDATION` was set — a hack from when dev mode had no real session. With the new main-process auto-sign-in producing a real session with a real org, the renderer was looking up host-service connections by the fake mock org while host-service had spawned for the real org → "Host service not available" toast. Flipping the priority (`session.org ?? (devMode ? mock : null)`) fixed all 16 sites with the same one-line pattern.

### Vite/Turbopack caches can mask real bugs during iteration

A mid-process `.next/` deletion left the dev server in a corrupted state — every route returned 404 even though the files existed. Full clean-restart fixed it. Don't trust caches during refactoring; reset between iterations.

### `electron-vite build` uses Node's native ESM loader for its config

`electron.vite.config.ts` does `await import("./src/main/env.main")` at config-load time, which Node handles directly. Any transitive `.ts` import from a sibling workspace package crashes the build. Workspace packages exporting `.ts` files (the common monorepo pattern here) only work for consumers that go through a transform layer.

### CDP is invaluable for verifying renderer state without manual clicks

Enabling Chrome DevTools Protocol in the Electron main process (one line of `app.commandLine.appendSwitch`) let me probe the React context for `activeHostUrl` directly. Confirmed the fix without needing to click "Import" in the UI. Faster + more honest than asking the user to retry.

### Most upstream OSS projects don't multi-profile cleanly

The previous research agent found nobody in the OSS reference class (Cal.com, Documenso, Plane, Twenty, Supabase, Formbricks) does true three-or-four-profile env validation. The closest is Formbricks (`createFinalSchema` + per-group `.refine()`). The pattern we shipped — `getDeploymentProfile()` + profile-keyed `skipValidation` + boot summary + `/api/health` — is novel relative to that ref class.

### CI build failures are a fast feedback loop you should actually use

I shipped the deployment-profile changes without checking `gh pr checks 4616`. The build broke. Next time: `gh pr checks` is part of the post-push ritual.

## What was built — commit-by-commit

| Commit | Theme |
|---|---|
| [`04130c0`](https://github.com/superset-sh/superset/pull/4616/commits/04130c0) | Core OSS path: DB driver swap, lazy-init guards (Stripe/Resend/PostHog), Better Auth email/password, desktop dev auto-sign-in, 17-file MOCK_ORG_ID priority fix, web app DevAuthForm, `db:seed:dev`, CDP for verification, docs |
| [`2b609b5`](https://github.com/superset-sh/superset/pull/4616/commits/2b609b5) | Deployment profiles + boot summary + `/api/health` endpoint |
| [`f3c76b9`](https://github.com/superset-sh/superset/pull/4616/commits/f3c76b9) | Flipped discriminator (strict by default, local profile opts into lenient) |
| [`101cd30`](https://github.com/superset-sh/superset/pull/4616/commits/101cd30) | Added `ci` profile (GitHub Actions auto-detect) |
| [`513d198`](https://github.com/superset-sh/superset/pull/4616/commits/513d198) | Five review-finding fixes: Stripe gate in `afterCreateOrganization`, email/password disabled in prod, docker-compose.dev.yml + Electric URL defaults, auto-sign-in API readiness poll, profile flags hash into Turbo cache |
| [`f3254ef`](https://github.com/superset-sh/superset/pull/4616/commits/f3254ef) | Fixed CI build (inlined profile check in `env.main.ts`); remaining hardcoded prod URL defaults switched to `devOrProdUrl()` helper across `electron.vite.config.ts`, `vite/helpers.ts`, `env.main.ts` |

## Verification

End-to-end smoke test after final commit:

```text
[superset] profile=local (lenient)
[superset] disabled features (set the listed env var(s) to enable):
           - stripe                       STRIPE_SECRET_KEY
           - resend (email)               RESEND_API_KEY
           - posthog (telemetry)          NEXT_PUBLIC_POSTHOG_KEY
           …
[dev-auto-sign-in] signed in as admin@local.test
[host-service:b499daed-…] listening on port 51257
```

DB sanity check confirmed the Stripe-gate fix:
```sql
SELECT email, name, slug, stripe_customer_id FROM auth.users JOIN auth.organizations ...
admin@local.test | Local Admin's Team | 14019d9c-team | <NULL>
```

Profile resolution unit test (all 6 cases pass):
```
✓ fresh clone (no env)                  → internal  (strict)
✓ Local contributor                     → local     (lenient)
✓ GitHub Actions                        → ci        (lenient)
✓ Vercel runtime                        → cloud     (strict)
✓ Vercel runtime overrides CI           → cloud     (strict)
✓ Local profile overrides CI            → local     (lenient)
```

CDP-probed React context:
```json
{ "activeHostUrl": "http://127.0.0.1:51257", "machineId": "…" }
```

Local CI reproduction:
- `bun run lint` — clean
- `bun run --cwd apps/desktop typecheck` — clean
- `bun turbo run build --filter=@superset/desktop` — succeeds

## What's still deferred (honest TODO list)

These are real follow-ups, none of them blocking the OSS path from working today:

- **`.env.example` with working defaults** — README says "edit DATABASE_URL + BETTER_AUTH_SECRET" without telling contributors the values. Pre-fill `postgres://superset:superset@localhost:5433/superset` + a sentinel `BETTER_AUTH_SECRET=dev_secret_not_for_production_*` and move optional integration keys to a `# OPTIONAL` block.
- **`bun setup` orchestrator** — current contributor flow is 6 commands. A `bun setup` wrapping `docker compose up`, `cp .env.example .env` if missing, `bun install`, `bun run db:migrate`, copy `.dev.vars`, with idempotency + friendly errors would collapse it to two: `bun setup && bun dev`.
- **Full integration crash audit** — Stripe, Resend, PostHog, trpc-support-Resend are wrapped. GitHub App (`@octokit/app`), Freestyle, Linear, Slack, QStash signing keys, Anthropic (`@anthropic-ai/sdk`), Blob (`@vercel/blob`) may still crash at import in the local profile. Mechanical `grep -rn "new \w\+(.*env\." packages apps` survey.
- **Mailpit instead of console-log emails** — Better Auth's `sendEmail` falls back to stdout. Mailpit container would give contributors a clickable UI at `localhost:8025`.
- **CI fresh-clone smoke test** — without one, the OSS path silently rots the next time someone adds a crash-on-import integration. A GitHub Actions job that does `git clone` in a fresh runner, follows the README, hits `/api/auth/ok`, fails if anything red.
- **Per-integration group `.refine()` validation** — Formbricks pattern. E.g. if `STRIPE_SECRET_KEY` is set then `STRIPE_WEBHOOK_SECRET` must also be set. Catches half-configured prod deploys.

## Architecture diagrams

### Profile resolution

```
┌─────────────────────────────────────────────────────────────────────┐
│                       getDeploymentProfile()                         │
│                                                                      │
│   VERCEL === "1" or VERCEL_ENV ─────────►  cloud      (strict)     │
│       │                                                              │
│       no                                                             │
│       ▼                                                              │
│   SUPERSET_PROFILE=local ────────────────►  local      (lenient)    │
│       │                                                              │
│       no                                                             │
│       ▼                                                              │
│   CI === "true"         ─────────────────►  ci         (lenient)    │
│       │                                                              │
│       no                                                             │
│       ▼                                                              │
│                          ─────────────────►  internal  (strict)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Local session lifecycle

```
┌──────────────────┐                  ┌──────────────────┐
│  Postgres :5433  │  wal_level=      │  Electric :4649  │
│  superset-pg     │  logical         │  superset-       │
│                  │ ◄────────────────┤  electric        │
└──────────────────┘  (docker-compose)└──────────────────┘
        ▲                                       ▲
        │ migrations                            │ shape stream
        │                                       │
        ▼                                       ▼
┌──────────────────────────────────────────────────────────────┐
│  bun dev (with SUPERSET_PROFILE=local)                         │
│                                                                │
│  apps/web      :4640  ─ Next.js, DevAuthForm visible          │
│  apps/api      :4641  ─ Better Auth + tRPC, /api/health       │
│                                                                │
│  apps/desktop:                                                 │
│     Electron main         ─ ensureDevAuthToken() polls API,    │
│                              POSTs sign-up/sign-in, saveToken()│
│     Vite renderer :4645  ─ AuthProvider.onTokenChanged hydrates│
│     Notifications :4646                                        │
│                                                                │
│  electric-proxy :4652  (Wrangler)  ─ ELECTRIC_SHAPE_URL=:4649 │
│  Caddy           :4650  (HTTPS)   ─ reverse proxy → :4652     │
└──────────────────────────────────────────────────────────────┘
        │
        │ host-service spawned per-org (dynamic port)
        ▼
┌──────────────────────────────────────────────────┐
│  Host service (per organization)                  │
│  superset-dev-data/host/<orgId>/host.db           │
│  Listening on dynamic port (e.g. :51257)          │
└──────────────────────────────────────────────────┘
```

### Strictness × visibility matrix

| Profile      | `skipValidation` | Boot summary    | `/api/health` shows         | Sign-in path                                  |
|--------------|------------------|------------------|------------------------------|------------------------------------------------|
| `cloud`      | false (strict)   | `profile=cloud (strict)`    | `profile: "cloud"`        | OAuth (email/password disabled in prod build)  |
| `internal`   | false (strict)   | `profile=internal (strict)` | `profile: "internal"`     | OAuth + dev email/password form (NODE_ENV=dev) |
| `ci`         | true (lenient)   | `profile=ci (lenient)`      | `profile: "ci"`           | n/a (build/test job, no runtime auth)          |
| `local`      | true (lenient)   | lists disabled features     | `profile: "local"`        | dev auto-sign-in + dev email/password form     |
