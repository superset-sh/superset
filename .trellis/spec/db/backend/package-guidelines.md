# @superset/db Backend Package Guidelines

## Scope
Cloud Postgres schema, Neon Drizzle clients, relations, Zod payload schemas, seed helpers, and SQL utilities.

## Source Examples
- `packages/db/src/client.ts` creates `db` and `dbWs` with Neon and `casing: "snake_case"`.
- `packages/db/src/schema/schema.ts` defines product tables with indexes and inferred types.
- `packages/db/src/schema/auth.ts`, `github.ts`, `ingest.ts`, and `relations.ts` split schema domains.
- `packages/db/src/utils/sql.ts` and `membership.ts` hold reusable database helpers.

## Local Patterns
- Use Drizzle schema APIs and exported inferred types; avoid hand-written row interfaces.
- Keep JSON payload validation in `schema/zod.ts` and JSON TypeScript shapes in `schema/types.ts`.
- Name indexes and uniqueness constraints explicitly.
- Use `dbWs.transaction` where follow-up reads need transaction IDs or WebSocket-compatible behavior.

## Cross-Package Contracts
- `packages/trpc` owns cloud RPC access to these tables.
- `apps/electric-proxy` and desktop/mobile collections depend on stable schema names and organization scoping.

## Avoid
- Do not manually edit `packages/db/drizzle/` artifacts.
- Do not touch production database state without explicit confirmation.
- Do not put local desktop-only state into cloud schema.

## Validation
- `bun --cwd packages/db typecheck`
- After schema edits, ask the user to run the Drizzle generate command on a Neon branch.
