# @superset/trpc Frontend Package Guidelines

## Scope
Inferred router input/output types and tRPC client contracts consumed by web, desktop, mobile, and SDK surfaces.

## Source Examples
- `packages/trpc/src/root.ts` exports `RouterInputs` and `RouterOutputs`.
- `apps/desktop/src/renderer/lib/api-trpc-client.ts` consumes cloud tRPC from desktop.
- `apps/mobile/lib/trpc/client.ts` consumes tRPC from mobile.

## Local Patterns
- Use inferred types from `@superset/trpc` rather than hand-written response interfaces.
- Keep returned payloads serializable through superjson.
- Coordinate client cache invalidation when mutation outputs or query keys change.

## Avoid
- Do not import server router implementation files into React components.
- Do not duplicate router path strings when a generated client hook exists.

## Validation
- `bun --cwd packages/trpc typecheck`
- Run consuming app typecheck for router contract changes.
