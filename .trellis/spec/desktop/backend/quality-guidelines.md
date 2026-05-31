# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after source edits.
- Run `bun run lint` and focused tests before pushing.
- Run `bun run typecheck` for shared type, router, schema, or package export changes.
- Use focused unit tests for schemas, routers, and helpers that branch on user or runtime state.
- When backend/main-process changes affect desktop startup, auth persistence, host-service coordination, terminal/runtime processes, or route availability, include the relevant Desktop Automation CLI acceptance path from `.trellis/spec/guides/desktop-acceptance-tdd.md` or document why it is not required.

## Review Checklist

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.
- Desktop Automation CLI acceptance assertions should be deterministic first and visual second: logs, route state, IPC/service readiness, files, visible roles/labels, and `wait-for` checks are gates; screenshots/reports are evidence for human or model visual inspection.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
