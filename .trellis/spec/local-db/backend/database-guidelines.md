# Database Guidelines

## Rules

- Use Drizzle ORM for database access.
- Do not touch production databases unless explicitly requested and confirmed.
- For cloud migrations, change schema files first and ask for `bunx drizzle-kit generate --name="<sample_name_snake_case>"`.
- Never manually edit `packages/db/drizzle/` SQL, snapshots, or journal files.
- Treat write/seeding effects differently from cache-first rendering; wait for strict readiness before deriving missing rows or writing defaults unless the write is provably idempotent.

- Cloud schema lives in `packages/db/src/schema/`.
- Desktop/local SQLite schema lives in `packages/local-db/src/schema/` and host-service local schema lives in `packages/host-service/src/db/schema.ts`.

## Examples

- `packages/local-db/src/schema/schema.ts`
- `packages/local-db/src/schema/relations.ts`
