# electric-proxy Frontend Package Guidelines

## Scope
Electric proxy contracts consumed by TanStack DB/Electric collection setup in desktop and mobile.

## Source Examples
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` consumes Electric-backed collections.
- `apps/mobile/lib/collections/collections.ts` sets up mobile collections.

## Local Patterns
- Coordinate shape names and auth assumptions with collection providers.
- Preserve cache-first UI behavior when proxy readiness changes.

## Avoid
- Do not make frontend code rely on unscoped Electric data.
- Do not duplicate proxy where-clause construction in UI components.

## Validation
- `bun --cwd apps/electric-proxy typecheck`
- Run consuming desktop/mobile typecheck for contract changes.
