# Database Guidelines

## Rules

- Use Drizzle ORM for database access.
- Do not touch production databases unless explicitly requested and confirmed.
- For cloud migrations, change schema files first and ask for `bunx drizzle-kit generate --name="<sample_name_snake_case>"`.
- Never manually edit `packages/db/drizzle/` SQL, snapshots, or journal files.
- Treat write/seeding effects differently from cache-first rendering; wait for strict readiness before deriving missing rows or writing defaults unless the write is provably idempotent.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
