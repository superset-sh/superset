# @superset/local-db Backend Package Guidelines

## Scope
Desktop-local SQLite schema, relations, generated migrations, and Zod validation for local settings and workspace state.

## Source Examples
- `packages/local-db/src/schema/schema.ts` defines projects, worktrees, workspaces, sections, and settings.
- `packages/local-db/src/schema/zod.ts` owns typed JSON payload schemas.
- `packages/local-db/drizzle/` contains generated migration artifacts.

## Local Patterns
- Use `sqliteTable`, text IDs with `uuidv4()` defaults, integer timestamps, and integer booleans for local data.
- Keep comments for constraints Drizzle cannot express, such as partial unique indexes.
- Export inferred insert/select types next to tables.
- Keep local schema focused on user/machine state; cloud state belongs in `packages/db`.

## Avoid
- Do not manually reshape generated migration snapshots.
- Do not store secrets in local DB columns unless the host-service security model explicitly covers them.
- Do not duplicate cloud schema tables locally unless they are offline/cache state.

## Validation
- `bun --cwd packages/local-db typecheck`
- Run desktop tests for local DB consumers when schema changes.
