# @superset/desktop Frontend Package Guidelines

## Scope
Electron renderer routes, TanStack Router screens, local components/hooks/providers/stores, command palette, React Query, TanStack DB collections, and desktop UI behavior.

## Source Examples
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` and route files show route organization.
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` owns collection provider setup.
- `apps/desktop/src/renderer/stores/README.md` defines Zustand store conventions.
- `apps/desktop/src/renderer/routes/_authenticated/settings/account/components/AccountSettings/AccountSettings.tsx` shows cache-first `useLiveQuery` rendering.
- `apps/desktop/src/renderer/lib/electron-trpc.ts` and `api-trpc-client.ts` separate local IPC and cloud API clients.

## Local Patterns
- Co-locate route-specific components, hooks, providers, and utils under the route folder.
- Use Zustand stores in `src/renderer/stores` for local UI state with typed selectors and devtools where useful.
- Use TanStack DB cache-first rendering: show existing rows even when `isReady` is false.
- Make error text selectable with `select-text cursor-text` when users may need to copy it.
- Keep cloud API calls through `apiTrpcClient` and Electron IPC through `electronTrpc`.

## Avoid
- Do not blank cached live-query data while collections reconnect.
- Do not import Electron main modules into renderer routes.
- Do not place route-only components in global `components` directories.

## Validation
- `bun --cwd apps/desktop test`
- `bun --cwd apps/desktop typecheck`
