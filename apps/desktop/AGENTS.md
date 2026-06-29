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

## Verifying renderer changes via CDP (Chrome DevTools Protocol)

The renderer is Chromium, so you can drive and inspect the **running dev app** over CDP to confirm a change works end-to-end against the real API/DB — no manual clicking.

**Enable it.** The main process opens a debug port only when `RENDERER_REMOTE_DEBUG_PORT` is set in dev (see `src/lib/electron-app/factories/app/setup.ts`):

```bash
RENDERER_REMOTE_DEBUG_PORT=9222 bun dev   # full stack: needs Docker (postgres/electric) + API/web up
```

The app restores a persisted session, so a fresh launch usually lands signed-in. Attach by reading the page target's `webSocketDebuggerUrl` from `http://localhost:9222/json`, then speak CDP over a WebSocket (Bun has a built-in `WebSocket` — no deps). Canonical example: `scripts/cdp-smoke-integrations.ts`.

**Prefer `Runtime.evaluate` over `Network.*` interception.** Running code *inside the renderer* and returning the value (`awaitPromise: true, returnByValue: true`) is far more reliable than sniffing network traffic, because:

- **React Query caches responses** — a query you want to observe often never re-fires on the wire.
- **`refetchInterval` is paused while the window is hidden/blurred** (React Query default `refetchIntervalInBackground: false`). An automated/unfocused window won't poll. (This also matters for any "view-time polling" feature — a backgrounded desktop window stops polling.)
- The **bearer token lives in a module closure** (`renderer/lib/auth-client`), so you can't replay an authed request from outside. But an in-renderer `fetch(url, { credentials: "include" })` carries the session cookie and authenticates.

**Recipes** (run as the `expression` of a `Runtime.evaluate`):

- Active org / prove auth: `await fetch(API + "/api/auth/get-session", { credentials: "include" })` → `.session.activeOrganizationId`.
- Call a tRPC query directly (bypasses the React Query cache): GET `API + "/api/trpc/<proc>?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: <input> } }))`. superjson wraps input in `{ json: ... }`; the response is `[{ "result": { "data": { "json": ... } } }]`.
- Navigate: `window.location.hash = "#/route"`. Caveat: this changes the URL but may **not** remount the route component, so don't rely on it to force a refetch — call the endpoint directly instead.

Use this to assert real behavior, e.g. that a tRPC response is column-masked (no `accessToken`/`refreshToken`) or that a table is no longer synced via an Electric `/v1/shape` request.