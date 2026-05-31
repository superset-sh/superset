# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after source edits.
- Run `bun run lint` and focused tests before pushing.
- Run `bun run typecheck` for shared type, router, schema, or package export changes.
- Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.

## Review Checklist

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.

## Examples

- `packages/sdk/package.json`
