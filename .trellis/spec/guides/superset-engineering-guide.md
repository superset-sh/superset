# Superset Engineering Guide

This guide captures repo-wide rules imported from `AGENTS.md`, package AGENTS files, and the current code layout. Load it for every Trellis task.

## Repo Shape

- Bun + Turbo monorepo.
- Apps: `apps/web`, `apps/marketing`, `apps/admin`, `apps/api`, `apps/desktop`, `apps/docs`, `apps/mobile`, plus support apps.
- Packages: `packages/ui`, `packages/db`, `packages/auth`, `packages/trpc`, `packages/shared`, `packages/mcp`, `packages/mcp-v2`, `packages/local-db`, `packages/host-service`, `packages/pty-daemon`, `packages/panes`, and related utilities.

## Non-Negotiable Rules

- Use Bun only. Do not introduce npm, yarn, pnpm, or package-lock/yarn/pnpm lockfiles.
- Run quality commands from the repo root unless a package script explicitly says otherwise: `bun run lint`, `bun run lint:fix`, `bun run typecheck`, `bun test`.
- Biome is root-scoped. Lint warnings fail CI, so run `bun run lint:fix` after edits and verify `bun run lint` exits 0 before pushing.
- Prefer strong TypeScript types. Avoid `any`; when boundary data is untyped, validate or narrow it close to the boundary.
- Keep plans in `plans/` or `apps/<app>/plans/`; shipped plans move to `plans/done/`. Architecture docs belong in `<app>/docs/`.
- Shared commands and skills live in `.agents/commands/` and `.agents/skills/`. `.claude/commands`, `.claude/skills`, `.cursor/commands`, `.codex/commands`, and `.codex/prompts` should stay symlinks or shared pointers, not divergent copies.
- Mastra dependencies must use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs or patch steps unless explicitly requested.
- For Next.js 16 request interception, use `proxy.ts`; never create `middleware.ts`.
- TanStack DB / Electric live queries are cache-first: render existing `data` even when collections are not ready. Use readiness only to choose between loading and empty states when there is no data.
- Never touch production databases unless explicitly requested and confirmed. Do not manually edit generated Drizzle migration files.

## Frontend Rules

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.
- Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.

## Backend Rules

- Use tRPC routers and procedures for API surfaces; validate inputs with Zod schemas at the procedure boundary.
- Use Drizzle ORM for database access. Keep schema changes in `packages/db/src/schema/` or host/local SQLite schema files, not in generated migration artifacts.
- Use `TRPCError` for expected API errors and typed result unions when callers need recoverable domain outcomes.
- Keep long-running local runtime state out of renderer React state. Terminal and host work belong in host-service / pty-daemon layers.
- Log operational failures with enough structured context to debug, but never log auth tokens, host secrets, provider credentials, or refresh tokens.
- Tests should sit next to risky behavior: `.test.ts` for unit tests, `.node-test.ts` for real Node/PTY flows, integration tests for cross-layer contracts.

## Desktop-Specific Rules

- Electron IPC must use tRPC as defined under `apps/desktop/src/lib/trpc`.
- Use path aliases from the nearest `tsconfig.json` where possible.
- Standard tRPC async-generator subscriptions do not work with `trpc-electron`; Electron subscriptions must return observables from `@trpc/server/observable`.
- Error text rendered in the desktop renderer must be selectable with `select-text cursor-text`.
- V2 workspace UI lives under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/` and uses `@superset/panes` for pane layout.
- Terminal panes attach to sessions created by host-service. Do not make React pane lifecycle own PTY lifetime.

## Mobile-Specific Rules

- `apps/mobile/app/` owns routing, redirects, route guards, and layouts.
- `apps/mobile/screens/` owns screen UI and business logic; mirror the `app/` structure and re-export screen components from routes.

## Database Rules

- Cloud schema: `packages/db/src/schema/`.
- Local desktop schema: `packages/local-db/src/schema/`.
- Host-service local schema: `packages/host-service/src/db/schema.ts`.
- Do not manually edit generated Drizzle migration files under `packages/db/drizzle/`.

## Good Examples

- Desktop v2 workspace route: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- Host-service app composition: `packages/host-service/src/app.ts`
- Terminal session adoption: `packages/host-service/src/terminal/terminal.ts`
- Detached PTY supervision: `packages/host-service/src/daemon/DaemonSupervisor.ts`
- Cloud schema ownership: `packages/db/src/schema/schema.ts`
- Shared UI shadcn exception: `packages/ui/src/components/ui/button.tsx`
- Mobile app/screens split: `apps/mobile/app/(authenticated)/(home)/index.tsx` and `apps/mobile/screens/(authenticated)/(home)/index.ts`
