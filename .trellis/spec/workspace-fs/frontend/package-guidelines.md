# @superset/workspace-fs Frontend Package Guidelines

## Scope
Client-side workspace filesystem contracts and resource URI helpers consumed by desktop/chat UI.

## Source Examples
- `packages/workspace-fs/src/client/index.ts` exports client helpers.
- `packages/workspace-fs/src/types.ts` defines shared file/search/watch types.
- `packages/chat/src/server/trpc/utils/file-search/file-search.ts` consumes workspace-fs search behavior.

## Local Patterns
- Use typed client exports and resource URI helpers in UI/client code.
- Keep file paths display-friendly at the UI layer while preserving raw paths in service types.
- Throttle expensive search/watch interactions through existing utilities.

## Avoid
- Do not import `src/host` into renderer components.
- Do not duplicate file tree or search cache logic in chat UI.

## Validation
- `bun --cwd packages/workspace-fs test`
- `bun --cwd packages/workspace-fs typecheck`
