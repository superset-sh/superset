# @superset/db Frontend Package Guidelines

## Scope
Types and schemas consumed by frontend packages through package exports.

## Source Examples
- `packages/db/src/index.ts` exports schema and helpers.
- `packages/db/src/schema/zod.ts` exports serializable config schemas.
- `packages/trpc/src/root.ts` exports `RouterInputs` and `RouterOutputs` built from DB-backed routers.

## Local Patterns
- Consume DB-backed data through tRPC, Electric/TanStack collections, or exported types; do not query cloud DB from client components.
- Use exported Zod schemas for config payload validation rather than re-declaring shapes in UI.
- Keep client-safe exports free of server-only database clients.

## Avoid
- Do not import `@superset/db/client` into browser or renderer UI.
- Do not duplicate enum string unions in frontend code when the package exports values.

## Validation
- `bun --cwd packages/db typecheck`
- Run consuming package typecheck when changing exported types.
