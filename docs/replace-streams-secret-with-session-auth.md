# Replace STREAMS_SECRET with Session-Based Auth

## Status: Implemented

## Problem

The streams server used a shared static `STREAMS_SECRET` (a 64-char hex string) for authentication. Every desktop instance used the same secret. This meant:

- **No per-user identity** — streams server couldn't tell who was making requests
- **No expiration** — the secret never expired
- **No revocation** — couldn't invalidate a single client without rotating the secret for everyone
- **Extra env coupling** — desktop build required `STREAMS_SECRET` at compile time
- **Separate from real auth** — not integrated with the better-auth system used everywhere else

## Solution

Use the user's existing better-auth session token (already obtained via OAuth login) to authenticate streams requests instead of a shared secret.

The desktop authenticates users via OAuth, gets a session token, and stores it encrypted at `~/.superset/auth-token.enc`. We:
1. Pass that token to the streams server instead of `STREAMS_SECRET`
2. Have the streams server validate it via a direct DB query against the `auth.sessions` table

**Why a direct DB query instead of `@superset/auth/server`?** The auth server module initializes Stripe, Resend, QStash, OAuth providers, etc. — requiring ~15 env vars. Way too heavy for the streams server. A direct DB query against the sessions table needs only `DATABASE_URL`.

## Flow

```
Desktop app
├── OAuth login → gets session token → stored encrypted at ~/.superset/auth-token.enc
├── Main process loads token via loadToken() from auth-functions.ts
├── Session manager sends Authorization: Bearer <session_token> to streams
└── Renderer SSE connection also uses session token (via getConfig tRPC procedure)

Streams server (apps/streams)
├── Middleware on /v1/* extracts Bearer token from Authorization header
├── Queries auth.sessions table: match token + check expiresAt > now()
├── Returns 401 if no valid session found
├── Attaches userId to Hono context for downstream use
└── Token expires naturally (30 days, same as session config)
```

## Implementation Summary

### Streams server (`apps/streams`)

- **`src/server.ts`**: Removed `authToken` from `AIDBProxyServerOptions`. Replaced string-comparison middleware with a Drizzle query against `auth.sessions` table — matches token and checks expiry. Attaches `userId` to Hono context.
- **`src/env.ts`**: Replaced `STREAMS_SECRET` with `DATABASE_URL` in env schema.
- **`src/index.ts`**: Removed `authToken: env.STREAMS_SECRET` from `createServer()` call.
- **`package.json`**: Added `@superset/db` and `drizzle-orm` dependencies.
- **`Dockerfile`**: Updated to include `packages/db` in the build and runtime stages.

### Desktop (`apps/desktop`)

- **`session-manager.ts`**: Replaced `const STREAMS_SECRET = env.STREAMS_SECRET` with `loadToken()` import. Made `buildProxyHeaders()` async — reads the user's encrypted session token from disk. Added `await` to all call sites.
- **`ai-chat/index.ts`**: Made `getConfig` procedure async. Returns `loadToken()` result instead of `env.STREAMS_SECRET`.
- **`env.main.ts`**: Removed `STREAMS_SECRET` from server schema and runtimeEnv.

### CI/CD and setup cleanup

| File | Change |
|------|--------|
| `turbo.jsonc` | Removed `STREAMS_SECRET` from `globalEnv` |
| `.github/workflows/ci.yml` | Removed `STREAMS_SECRET` env and TODO comment |
| `.github/workflows/deploy-preview.yml` | Replaced `STREAMS_SECRET` secret with `DATABASE_URL`; added `needs: deploy-database` |
| `.github/workflows/deploy-production.yml` | Replaced `STREAMS_SECRET` with `DATABASE_URL` in `flyctl secrets set` |
| `.superset/setup.sh` | Removed `step_setup_streams()` function and `STREAMS_SECRET` env output |

## Key Files

| File | Role |
|------|------|
| `apps/streams/src/server.ts` | DB-based session validation middleware |
| `apps/streams/src/env.ts` | DATABASE_URL env definition |
| `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts` | Async buildProxyHeaders() using loadToken() |
| `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts` | getConfig returns session token to renderer |
| `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts` | loadToken() — reads encrypted auth token from disk |
| `packages/db/src/schema/auth.ts` | Sessions table schema used by streams middleware |

## Verification

1. **Auth flow works**: Sign in via OAuth on desktop → token saved → streams requests use that token → streams server validates via DB
2. **Unauthenticated requests rejected**: Streams server returns 401 without a valid session token
3. **Session expiry works**: After session expires (30 days default), streams requests fail → user must re-authenticate
4. **No STREAMS_SECRET references remain**: `grep -r STREAMS_SECRET` across source code returns no matches
5. **CI builds pass**: Desktop builds without STREAMS_SECRET env var
6. **SSE connections work**: Renderer ChatInterface connects to streams SSE with session token in Authorization header
