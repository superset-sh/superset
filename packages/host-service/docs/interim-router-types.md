# INTERIM: compiled router type declarations (`dist-types`)

**Status: temporary.** This machinery exists so non-Node clients (today: `apps/mobile`)
can consume `AppRouter` without typechecking host-service's Node-flavored source under
their own tsconfig (Expo/RN fails on `.ts` import extensions, its ambient `ProcessEnv`,
and DOM-style timer types — in this package and its workspace deps).

**End state that replaces it:** the wire contract moves to a runtime-neutral package
(zod schemas + inferred types per procedure; SCP v1 / `packages/chat-protocol` is the
same pattern for chat). Clients consume the contract package; host-service asserts its
router conforms. Once that lands, everything below gets reverted.

## Every change that enables this (from `feat(host-service): ship compiled router type declarations for cross-runtime consumers`)

Declaration emit for the router's type graph — the four packages the router types reach:

| File | Change |
|---|---|
| `packages/host-service/tsconfig.types.json` | new — `emitDeclarationOnly` into `dist-types/` |
| `packages/host-service/package.json` | `build:types` script; **types-only `./router` export** → `./dist-types/trpc/router/router.d.ts` |
| `packages/port-scanner/{tsconfig.types.json,package.json}` | same, **plus `exports.*.types` repointed from `src/*.ts` to `dist-types/*.d.ts`** (affects all consumers, not just mobile) |
| `packages/pty-daemon/{tsconfig.types.json,package.json}` | same as port-scanner |
| `packages/workspace-fs/{tsconfig.types.json,package.json}` | same as port-scanner |
| `turbo.jsonc` | `build:types` task (`outputs: dist-types/**`); `typecheck.dependsOn` gains `^build:types` |
| `.gitignore` | `dist-types` (artifacts are generated, never committed) |

Nameability shims — declaration emit can't reference unexported types (TS4023/TS2742),
so these were exported solely for the emit:

| File | Change |
|---|---|
| `packages/host-service/src/trpc/index.ts` | `RouterMeta` exported |
| `packages/host-service/src/trpc/router/project/handlers.ts` | `CreateResult` exported |
| `packages/host-service/src/trpc/router/workspace-creation/procedures/search-github-issues.ts` | result type exported |
| `packages/host-service/src/trpc/router/workspace-creation/procedures/search-pull-requests.ts` | result type exported |
| `packages/chat/src/server/desktop/index.ts` | re-exports `AnthropicEnvVariables`, `AuthStatus`, `ResolvedSlashCommand` |

Consumer side:

| File | Change |
|---|---|
| `apps/mobile/package.json` | deps on `@superset/host-service` (type-only) and `@trpc/server` (for `inferRouterOutputs`) |
| `apps/mobile/lib/host-service/client.ts` | `import type { AppRouter } from "@superset/host-service/router"`; output aliases via `inferRouterOutputs` |

## Known costs (why this isn't the end state)

- IDE types go stale until `build:types` reruns (turbo covers CI, not your editor).
- Four packages carry build steps whose only consumer is mobile's typecheck.
- The `exports.types` repointing in port-scanner/pty-daemon/workspace-fs changed what
  *desktop and every other consumer* typecheck against too.
- Server-internal types (mastra harness types in the chat router) still cross the wire.

## Revert checklist (do this when the contract package lands)

1. Point `apps/mobile/lib/host-service/client.ts` at the contract package's types;
   drop mobile's `@superset/host-service` and `@trpc/server` deps.
2. Delete the four `tsconfig.types.json` files and their `build:types` scripts.
3. Restore `exports.*.types` in port-scanner/pty-daemon/workspace-fs to the `src/*.ts`
   paths (see the commit named above for the originals).
4. Remove the `./router` export from `packages/host-service/package.json`.
5. Remove `build:types` from `turbo.jsonc` and `^build:types` from `typecheck.dependsOn`;
   drop `dist-types` from `.gitignore`.
6. The nameability `export type` shims are harmless to keep, but no longer required.
7. `grep -rn "dist-types\|build:types\|host-service/router" --include="*.json" --include="*.ts"`
   should come back empty (this doc excepted).
