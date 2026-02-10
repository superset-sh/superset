# Replace STREAMS_SECRET with Session-Based Auth

## Problem

The streams server uses a shared static `STREAMS_SECRET` (a 64-char hex string) for authentication. Every desktop instance uses the same secret. This means:

- **No per-user identity** — streams server can't tell who is making requests
- **No expiration** — the secret never expires
- **No revocation** — can't invalidate a single client without rotating the secret for everyone
- **Extra env coupling** — desktop build requires `STREAMS_SECRET` at compile time
- **Separate from real auth** — not integrated with the better-auth system used everywhere else

## Solution

Use the user's existing better-auth session token (already obtained via OAuth login) to authenticate streams requests instead of a shared secret.

The desktop already authenticates users via OAuth → gets a session token → stores it encrypted on disk. We just need to:
1. Pass that token to the streams server instead of `STREAMS_SECRET`
2. Have the streams server validate it against better-auth

## Current Flow

```
Desktop app
├── OAuth login → gets session token → stored encrypted at ~/.superset/auth-token.enc
├── Renderer uses token for better-auth API calls (via auth-client.ts)
├── BUT for streams: uses separate STREAMS_SECRET from env
└── Session manager sends Authorization: Bearer <STREAMS_SECRET> to streams

Streams server (apps/streams)
├── Loads STREAMS_SECRET from env
├── Middleware on /v1/* does string comparison: authorization === `Bearer ${STREAMS_SECRET}`
└── No user identity, no session validation
```

## Target Flow

```
Desktop app
├── OAuth login → gets session token (same as today)
├── Main process loads token from auth-token.enc (same as today)
├── Session manager sends Authorization: Bearer <session_token> to streams
└── Renderer SSE connection also uses session token

Streams server (apps/streams)
├── Middleware on /v1/* validates token via better-auth
├── Calls auth.api.getSession({ headers }) — same pattern as apps/api
├── Knows which user is making requests
└── Token expires naturally (30 days, same as session config)
```

## Implementation

### Step 1: Streams server — replace string comparison with better-auth validation

**File: `apps/streams/src/server.ts`**

The current auth middleware (lines 59-68) does a simple string match:

```typescript
// CURRENT — remove this
if (options.authToken) {
  const expectedHeader = `Bearer ${options.authToken}`;
  app.use("/v1/*", async (c, next) => {
    const authorization = c.req.header("Authorization");
    if (authorization !== expectedHeader) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });
}
```

Replace with better-auth session validation:

```typescript
// NEW — validate session via better-auth
import { auth } from "@superset/auth/server";

app.use("/v1/*", async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // Optionally attach session to context for downstream use
  c.set("session", session);
  return next();
});
```

This is the exact same pattern used by `apps/api/src/trpc/context.ts` (line 10-12).

**File: `apps/streams/src/types.ts`** (or wherever `AIDBProxyServerOptions` is)

Remove `authToken` from the server options interface. The server now validates tokens itself via better-auth rather than comparing against a static string.

**File: `apps/streams/src/index.ts`**

Remove `authToken: env.STREAMS_SECRET` from the `createServer()` call (line 43).

**File: `apps/streams/src/env.ts`**

Remove `STREAMS_SECRET` from the env schema (line 10). The streams server will need the database connection and `BETTER_AUTH_SECRET` env vars instead (same as `apps/api`). Check what `@superset/auth/server` needs to initialize — it uses `packages/auth/src/env.ts` for its env requirements.

### Step 2: Desktop — pass user session token to streams instead of STREAMS_SECRET

**File: `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts`**

The session manager currently imports `STREAMS_SECRET` from env and uses it in `buildProxyHeaders()` (lines 15-37):

```typescript
// CURRENT — remove
const STREAMS_SECRET = env.STREAMS_SECRET;

function buildProxyHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${STREAMS_SECRET}`,
  };
}
```

Replace with the user's auth token loaded from encrypted disk storage:

```typescript
// NEW — use the user's session token
import { loadToken } from "../../auth/utils/auth-functions";

async function buildProxyHeaders(): Promise<Record<string, string>> {
  const { token } = await loadToken();
  if (!token) {
    throw new Error("User not authenticated");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}
```

`loadToken()` reads the encrypted token from `~/.superset/auth-token.enc` — see `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts` (lines 29-40).

Note: `buildProxyHeaders()` becomes async. Update all call sites (they're all in async functions already, so this is straightforward — just add `await`).

**File: `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts`**

The `getConfig` procedure currently exposes `STREAMS_SECRET` to the renderer (lines 58-61):

```typescript
// CURRENT
getConfig: publicProcedure.query(() => ({
  proxyUrl: env.STREAMS_URL,
  authToken: env.STREAMS_SECRET,
})),
```

Replace with the user's session token:

```typescript
// NEW
getConfig: publicProcedure.query(async () => {
  const { token } = await loadToken();
  return {
    proxyUrl: env.STREAMS_URL,
    authToken: token,
  };
}),
```

The renderer uses this in `ChatInterface.tsx` (line 70, 87-88) to set the `Authorization` header on SSE connections. No renderer changes needed — it already passes `authToken` as a Bearer token.

### Step 3: Remove STREAMS_SECRET from desktop env

**File: `apps/desktop/src/main/env.main.ts`**

Remove `STREAMS_SECRET` from the env schema (line 23) and runtimeEnv (line 37).

### Step 4: Remove STREAMS_SECRET from CI/CD and setup

**Files to update:**

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Remove `STREAMS_SECRET` from desktop build env (lines ~131-132) |
| `.github/workflows/deploy-preview.yml` | Remove `STREAMS_SECRET` from `flyctl secrets set` (line ~138) |
| `.github/workflows/deploy-production.yml` | Remove `STREAMS_SECRET` from `flyctl secrets set` (line ~414) |
| `.superset/setup.sh` | Remove `STREAMS_SECRET` generation (lines ~302-310) |
| `.env` / `.env.example` | Remove `STREAMS_SECRET` |

### Step 5: Add auth dependencies to streams server

The streams server (`apps/streams`) needs to import `@superset/auth/server` for session validation. This means it needs:

1. Add `@superset/auth` as a workspace dependency in `apps/streams/package.json`
2. Ensure the auth-related env vars are available to the streams server:
   - `BETTER_AUTH_SECRET`
   - `DATABASE_URL` (auth needs DB access for session lookup)
   - Other vars required by `packages/auth/src/env.ts`

Check `packages/auth/src/env.ts` for the full list of required env vars. Some (like Stripe, Resend, OAuth secrets) may need to be made optional if they aren't already, since the streams server only needs session validation — not the full auth feature set.

**Alternative**: If adding the full auth dependency to streams feels heavy, you can use better-auth's JWT verification instead. The `jwt()` plugin is already configured in the auth server (RS256, 1hr expiry). The streams server could verify JWTs using just the public key (JWKS endpoint) without needing a database connection. This is a lighter-weight option but requires the desktop to obtain a JWT (via `auth.api.getToken()`) rather than using the raw session token.

## Key Files Reference

| File | Role |
|------|------|
| `apps/streams/src/server.ts:59-68` | Current string-comparison auth middleware |
| `apps/streams/src/env.ts:10` | STREAMS_SECRET env definition |
| `apps/streams/src/index.ts:43` | Passes STREAMS_SECRET to createServer() |
| `apps/desktop/src/main/env.main.ts:23,37` | Desktop env schema with STREAMS_SECRET |
| `apps/desktop/src/lib/trpc/routers/ai-chat/index.ts:58-61` | getConfig exposes STREAMS_SECRET to renderer |
| `apps/desktop/src/lib/trpc/routers/ai-chat/utils/session-manager/session-manager.ts:15-37` | buildProxyHeaders() uses STREAMS_SECRET |
| `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts:29-40` | loadToken() — reads encrypted auth token from disk |
| `apps/desktop/src/renderer/lib/auth-client.ts:11-18` | Renderer auth token management |
| `apps/desktop/src/renderer/screens/main/.../ChatInterface.tsx:70,85-88` | Renderer uses getConfig authToken for SSE |
| `apps/api/src/trpc/context.ts:10-12` | Reference pattern — API validates sessions via `auth.api.getSession()` |
| `packages/auth/src/server.ts:126-135` | JWT plugin config (RS256, 1hr) |
| `packages/auth/src/server.ts:427` | bearer() plugin for header-based auth |

## Verification

1. **Auth flow works**: Sign in via OAuth on desktop → token saved → streams requests use that token → streams server validates it
2. **Unauthenticated requests rejected**: Streams server returns 401 without a valid session token
3. **Session expiry works**: After session expires (30 days default), streams requests fail → user must re-authenticate
4. **No STREAMS_SECRET references remain**: `grep -r STREAMS_SECRET` across the codebase returns nothing
5. **CI builds pass**: Desktop builds without STREAMS_SECRET env var
6. **SSE connections work**: Renderer ChatInterface connects to streams SSE with session token in Authorization header
