# @superset/workspace-fs Backend Package Guidelines

## Scope
Workspace filesystem service core, host implementation, search/cache/watch logic, resource URI handling, and throttled worker.

## Source Examples
- `packages/workspace-fs/src/core/service.ts` defines core service behavior.
- `packages/workspace-fs/src/host/service.ts` implements host-side filesystem service.
- `packages/workspace-fs/src/search.ts`, `watch.ts`, and cache tests cover file search/watch behavior.
- `packages/workspace-fs/src/resource-uri.ts` owns resource URI parsing and formatting.

## Local Patterns
- Keep host filesystem side effects under `src/host` and client-safe contracts under `src/client`/`src/core`.
- Use `resource-uri.ts` helpers for resource identifiers; do not parse URIs ad hoc.
- Keep search and watch caches bounded; preserve eviction/growth tests when changing caches.
- Add tests for path normalization, watcher behavior, and error messages.

## Avoid
- Do not let browser/client code import host filesystem modules.
- Do not hand-roll fuzzy scoring when `fuzzy-scorer.ts` applies.
- Do not return raw Node errors to UI without mapping through `error-message.ts`.

## Validation
- `bun --cwd packages/workspace-fs test`
- `bun --cwd packages/workspace-fs typecheck`
