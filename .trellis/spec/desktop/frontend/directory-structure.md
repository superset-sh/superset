# Directory Structure

## Package

- Path: `apps/desktop`
- Role: Electron desktop app. This is the primary package for v2 workspace refactors.

## Repo Rules

- Use Bun only. Do not introduce npm, yarn, pnpm, or package-lock/yarn/pnpm lockfiles.
- Run quality commands from the repo root unless a package script explicitly says otherwise: `bun run lint`, `bun run lint:fix`, `bun run typecheck`, `bun test`.
- Biome is root-scoped. Lint warnings fail CI, so run `bun run lint:fix` after edits and verify `bun run lint` exits 0 before pushing.
- Prefer strong TypeScript types. Avoid `any`; when boundary data is untyped, validate or narrow it close to the boundary.
- Keep plans in `plans/` or `apps/<app>/plans/`; shipped plans move to `plans/done/`. Architecture docs belong in `<app>/docs/`.
- Shared commands and skills live in `.agents/commands/` and `.agents/skills/`. `.claude/commands`, `.claude/skills`, `.cursor/commands`, `.codex/commands`, and `.codex/prompts` should stay symlinks or shared pointers, not divergent copies.
- Mastra dependencies must use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs or patch steps unless explicitly requested.

## Frontend / TypeScript Structure Rules

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.

## Desktop Structure

- `apps/desktop/src/main/` owns Electron main-process lifecycle, host-service coordination, native permissions, tray/menu, and bundled CLI setup.
- `apps/desktop/src/preload/` is the preload bridge. Keep it narrow.
- `apps/desktop/src/lib/trpc/` is the Electron IPC boundary. Per `apps/desktop/AGENTS.md`, use tRPC for Electron IPC instead of ad hoc ipcMain/ipcRenderer channels.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/` owns the v2 workspace shell.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/` owns pane registration and pane viewer wiring.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
