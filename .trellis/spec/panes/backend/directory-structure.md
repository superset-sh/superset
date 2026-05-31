# Directory Structure

## Package

- Path: `packages/panes`
- Role: Reusable split-pane workspace layout store and React renderer.

## Repo Rules

- Use Bun only. Do not introduce npm, yarn, pnpm, or package-lock/yarn/pnpm lockfiles.
- Run quality commands from the repo root unless a package script explicitly says otherwise: `bun run lint`, `bun run lint:fix`, `bun run typecheck`, `bun test`.
- Biome is root-scoped. Lint warnings fail CI, so run `bun run lint:fix` after edits and verify `bun run lint` exits 0 before pushing.
- Prefer strong TypeScript types. Avoid `any`; when boundary data is untyped, validate or narrow it close to the boundary.
- Keep plans in `plans/` or `apps/<app>/plans/`; shipped plans move to `plans/done/`. Architecture docs belong in `<app>/docs/`.
- Shared commands and skills live in `.agents/commands/` and `.agents/skills/`. `.claude/commands`, `.claude/skills`, `.cursor/commands`, `.codex/commands`, and `.codex/prompts` should stay symlinks or shared pointers, not divergent copies.
- Mastra dependencies must use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs or patch steps unless explicitly requested.

## Backend Structure Rules

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.

## Examples

- `packages/panes/src/core/store/store.ts`
- `packages/panes/src/react/components/Workspace/Workspace.tsx`
