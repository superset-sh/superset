# Implementation details
For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

## Error text must be selectable

The renderer sets `user-select: none` on `body`, so rendered errors need explicit `select-text cursor-text` classes — otherwise users can't copy them into bug reports. (Sonner toasts are exempt; they manage selection themselves.)

## tRPC Subscriptions (trpc-electron)

**Important:** While standard tRPC recommends async generators for subscriptions, `trpc-electron` (used for Electron IPC) **only supports observables**. The library explicitly checks `isObservable(result)` and throws an error otherwise. Use the `observable` pattern:

```typescript
// CORRECT for trpc-electron - use observable pattern
import { observable } from "@trpc/server/observable";

export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(() => {
      return observable<MyEvent>((emit) => {
        const handler = (data: MyData) => {
          emit.next({ type: "my-event", data });
        };

        myEmitter.on("my-event", handler);

        return () => {
          myEmitter.off("my-event", handler);
        };
      });
    }),
  });
};

// WRONG for trpc-electron - async generators don't work with IPC transport
export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(async function* () {
      // This will NOT work - the generator never gets invoked
      while (true) {
        yield await getNextEvent();
      }
    }),
  });
};
```

## Verifying renderer changes via CDP

To check a change end-to-end against the real API/DB, drive the running dev app over CDP. Launch with an unused port, for example `RENDERER_REMOTE_DEBUG_PORT=9222 bun dev` (full stack; the app may restore a signed-in session), then attach via the page target's `webSocketDebuggerUrl` over a WebSocket (Bun built-in, no deps). Example: `scripts/cdp-smoke-integrations.ts`.

**Never assume port 9222 or attach to a renderer from another worktree.** Multiple Superset workspaces commonly run at once, each with different renderer, API, and CDP ports. Before testing:

1. Read this workspace's final `DESKTOP_VITE_PORT` and `NEXT_PUBLIC_API_URL` values from the root `.env`.
2. Find the Electron process whose executable/parent command path is inside this workspace. Its renderer command line contains `--remote-debugging-port=<port>`; `lsof -nP -iTCP -sTCP:LISTEN` can confirm the owning PID.
3. Fetch `http://127.0.0.1:<port>/json/list` and require a `page` target whose URL uses this workspace's `DESKTOP_VITE_PORT`. A responding CDP endpoint alone is not sufficient proof that it belongs to this branch.
4. Pass the matched values explicitly when using a script, e.g. `RENDERER_REMOTE_DEBUG_PORT=<port> NEXT_PUBLIC_API_URL=<api-origin> bun run apps/desktop/scripts/cdp-smoke-integrations.ts`.

Verify `/api/auth/get-session` from inside the matched renderer before testing.

### Repairing CDP auth

Check which setup script provisioned the workspace before repairing auth:

- `.superset/setup.local.sh` creates a per-workspace local stack and runs the idempotent `bun run db:seed-dev`, but intentionally leaves sign-in as a separate step. If the account may be missing, rerun `bun run db:seed-dev` while the local DB stack is running.
- `.superset/setup.sh` seeds `superset-dev-data/auth-token.enc` from `$HOME/.superset/auth-token.enc` when available. Rerunning it without `--force` can fill a missing token. Do not use `--force` merely to repair auth: it resets `superset-dev-data/` before reseeding.

The desktop hydrates a persisted token into an in-memory bearer-token closure. A raw `Runtime.evaluate` `fetch` cannot read that closure, and the local-dev sign-in button persists a bearer token but uses `credentials: "omit"`; neither guarantees the cookie required by a raw CDP probe. For a workspace created by `setup.local.sh`, repair the CDP session as follows:

1. Require a localhost API origin; never send dev credentials to a remote or shared API.
2. From `apps/desktop` (so workspace imports resolve), import `DEV_EMAIL` and `DEV_PASSWORD` from `@superset/shared/dev-credentials`; do not copy their literal values into scripts or logs.
3. Through `Runtime.evaluate` in the matched renderer, POST them to `${NEXT_PUBLIC_API_URL}/api/auth/sign-in/email` with JSON content type and `credentials: "include"`. Do not print the returned token or response body.
4. Re-fetch `/api/auth/get-session` with `credentials: "include"` and require both `session` and `session.activeOrganizationId` before running the test.

This credentialed local-dev sign-in creates the browser session cookie needed by subsequent in-renderer fetches. If it fails, report the sign-in/session status codes only. For a non-local setup, use the app's normal sign-in flow; never substitute local dev credentials.

For a non-local workspace, the normal desktop flow intentionally restores an encrypted bearer token into the renderer's in-memory auth client without creating a browser cookie. If the renderer is on an authenticated route but a raw cookie-only probe returns no session, use `Runtime.evaluate` to import `/lib/auth-client.ts` from the renderer dev server and call `authClient.getSession({ fetchOptions: { throw: false } })`. This still verifies `/api/auth/get-session` through the app's real authenticated request path. Return only the status and `session.activeOrganizationId`; never call or print `getAuthToken()`.

Do not use setup `--force` to fix a stale connection string, a missing CDP cookie, or a corrupt generated Next.js cache. First rerun the applicable setup script without force. If every API route returns Next.js's HTML 404, stop the dev stack, move `apps/api/.next` aside, and restart. `--force` is only appropriate when the user explicitly intends to replace the copied local/host databases and encrypted auth token.

**Use `Runtime.evaluate` (`awaitPromise`, `returnByValue`), not `Network.*` interception** — sniffing misses React-Query-cached responses, and `refetchInterval` is paused while the window is backgrounded. After verifying the session through the applicable cookie or bearer path above, run requests inside the renderer. `API` below is the dev backend origin (`NEXT_PUBLIC_API_URL`, e.g. `http://localhost:5881`):

- Active org: local cookie flow uses `fetch(API + "/api/auth/get-session", {credentials:"include"})`; non-local bearer flow uses `authClient.getSession({ fetchOptions: { throw: false } })`. Require `.session.activeOrganizationId`.
- A tRPC query (bypasses the cache): GET `API + "/api/trpc/<proc>?batch=1&input=" + encodeURIComponent(JSON.stringify({"0":{json:<input>}}))`; response is `[{result:{data:{json:...}}}]`.
- `window.location.hash` nav may not remount the route — call the endpoint directly instead.
