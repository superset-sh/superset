# Implementation details

## Build & Deploy (Fork)

**WICHTIG:** `dist/` und `release/` MÜSSEN vorher gelöscht werden, sonst hängt electron-builder!

**One-Liner Build (im `apps/desktop/` Verzeichnis):**
```bash
rm -rf dist/ && SKIP_ENV_VALIDATION=1 bun run compile:app && \
bun run copy:native-modules && \
rm -rf release/mac-arm64/ && \
SKIP_ENV_VALIDATION=1 CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_NOTARIZE=true \
  bun run package -- --publish never --config.mac.identity=null && \
cd release/mac-arm64 && dot_clean Superset.app 2>/dev/null; \
find Superset.app -exec xattr -c {} + 2>/dev/null; \
codesign --sign - --force --deep --no-strict Superset.app
```

**Install + Launch:**
```bash
killall Superset 2>/dev/null; sleep 1
rm -rf /Applications/Superset.app
cp -R release/mac-arm64/Superset.app /Applications/Superset.app
open /Applications/Superset.app
```

**Update-Script:** `~/bin/superset-update` (fetch + merge + build + install)

**Pflicht-Flags:**
- `SKIP_ENV_VALIDATION=1` — sonst Login-Screen
- `CSC_IDENTITY_AUTO_DISCOVERY=false` + `--config.mac.identity=null` — Fork hat kein Apple Codesigning
- `rm -rf dist/` — ohne das hängt electron-builder bei "no node modules"!

**Dev-Server (NICHT `bun run dev` aus Root!):**
```bash
cd apps/desktop
SKIP_ENV_VALIDATION=1 NODE_ENV=development bun x cross-env NODE_ENV=development electron-vite dev --watch
```

For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

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