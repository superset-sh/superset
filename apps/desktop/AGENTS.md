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

To check a change end-to-end against the real API/DB, drive the running dev app over CDP. Launch with `RENDERER_REMOTE_DEBUG_PORT=9222 bun dev` (full stack; the app restores a signed-in session), attach via the page target's `webSocketDebuggerUrl` from `localhost:9222/json` over a WebSocket (Bun built-in, no deps). Example: `scripts/cdp-smoke-integrations.ts`.

**Use `Runtime.evaluate` (`awaitPromise`, `returnByValue`), not `Network.*` interception** — sniffing misses React-Query-cached responses, and `refetchInterval` is paused while the window is backgrounded. Run an in-renderer `fetch(url, { credentials: "include" })` (the bearer token is in a closure, but the session cookie works). `API` below is the dev backend origin (`NEXT_PUBLIC_API_URL`, e.g. `http://localhost:5881`):

- Active org: `fetch(API + "/api/auth/get-session", {credentials:"include"})` → `.session.activeOrganizationId`.
- A tRPC query (bypasses the cache): GET `API + "/api/trpc/<proc>?batch=1&input=" + encodeURIComponent(JSON.stringify({"0":{json:<input>}}))`; response is `[{result:{data:{json:...}}}]`.
- `window.location.hash` nav may not remount the route — call the endpoint directly instead.