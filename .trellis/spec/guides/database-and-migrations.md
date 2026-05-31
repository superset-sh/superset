# Database And Migrations

## Cloud Database
- `packages/db/src/client.ts` creates Neon HTTP and WebSocket Drizzle clients with `casing: "snake_case"`.
- Schema lives in `packages/db/src/schema/`. Keep enums in `enums.ts`, tables in domain schema files, relations in `relations.ts`, and Zod payload schemas in `zod.ts`.
- Use Drizzle table inference types: `typeof table.$inferInsert` and `typeof table.$inferSelect`. Examples: `InsertTask`, `SelectTask`, `InsertProject`, and `SelectProject`.
- Use explicit indexes and unique constraints in table callbacks. `packages/db/src/schema/schema.ts` shows the naming pattern, for example `tasks_org_slug_unique`.

## Local Databases
- `packages/local-db/src/schema/schema.ts` uses `sqliteTable`, integer booleans, `uuidv4()` defaults, and JSON typed columns for desktop-local state.
- `packages/host-service/src/db/schema.ts` owns host-service SQLite state. Keep host-service database changes scoped there; do not mix local machine state into cloud schema.
- Keep local database validation schemas near the schema package, for example `packages/local-db/src/schema/zod.ts`.

## Migration Rules
- Never touch the production database unless explicitly asked, and confirm before doing so.
- For cloud schema changes, create a Neon branch, point local root `.env` files at that branch, modify only `packages/db/src/schema/`, then generate with `bunx drizzle-kit generate --name="sample_name_snake_case"`.
- Do not manually edit generated migration artifacts under `packages/db/drizzle/`, including SQL files, snapshots, and `meta/_journal.json`.
- Treat package-local `drizzle/` folders as generated outputs as well unless a package-specific workflow says otherwise.
- Do not run migrations yourself unless the user explicitly asks for that operation.

## Schema Example
```ts
export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("tasks_organization_id_idx").on(table.organizationId),
]);
export type SelectTask = typeof tasks.$inferSelect;
```
