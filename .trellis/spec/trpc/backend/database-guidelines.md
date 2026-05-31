# Database Guidelines

## Rules

- Use Drizzle ORM for database access.
- Do not touch production databases unless explicitly requested and confirmed.
- For cloud migrations, change schema files first and ask for `bunx drizzle-kit generate --name="<sample_name_snake_case>"`.
- Never manually edit `packages/db/drizzle/` SQL, snapshots, or journal files.
- Treat write/seeding effects differently from cache-first rendering; wait for strict readiness before deriving missing rows or writing defaults unless the write is provably idempotent.

## Examples

- `packages/trpc/src/root.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `packages/trpc/src/router/chat/chat.ts`
