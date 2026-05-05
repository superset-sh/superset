# Implementation details
For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

## Error text must be selectable

The renderer globally disables text selection (`globals.css` sets `user-select: none` on `body`), so any text the user might want to copy needs an explicit `select-text` (and usually `cursor-text`) class. **Always make user-facing error messages selectable** — error strings, stack traces, failure reasons, exception bodies — so users can paste them into bug reports or search them.

```tsx
// CORRECT: error text the user can copy
<p className="select-text cursor-text font-mono text-xs text-destructive">
  {error.message}
</p>

// WRONG: silently un-selectable due to body { user-select: none }
<p className="font-mono text-xs text-destructive">{error.message}</p>
```

This applies to error overlays, error pages, error banners, failure states, and any rendered exception detail. Toast bodies are an exception — Sonner manages its own selection rules.

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