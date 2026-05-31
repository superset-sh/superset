# @superset/local-db Frontend Package Guidelines

## Scope
Types and schemas from local-db consumed by desktop renderer and local data flows.

## Source Examples
- `packages/local-db/src/index.ts` re-exports schema, relations, and Zod modules.
- `apps/desktop/src/renderer/stores/*.ts` stores UI state that complements local DB state.

## Local Patterns
- Consume exported local-db types instead of retyping settings/workspace rows in UI.
- Keep validation of JSON settings aligned with `schema/zod.ts`.
- Use local DB for durable machine state, not transient UI state better handled by Zustand.

## Avoid
- Do not import server-only DB clients into renderer components.
- Do not fork local settings types in desktop stores.

## Validation
- `bun --cwd packages/local-db typecheck`
- Run desktop typecheck when local-db exports change.
