# Frontend Guidelines: apps/desktop

Electron desktop app. This is the primary package for v2 workspace refactors.

## Read First

- Follow the repo-wide guide: `.trellis/spec/guides/superset-engineering-guide.md`.
- For desktop-facing behavior, follow `.trellis/spec/guides/desktop-acceptance-tdd.md` before implementation and during validation.
- Follow root `AGENTS.md` and any nearer package `AGENTS.md`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`

## Guide Index

- [Directory Structure](./directory-structure.md)
- [Component Guidelines](./component-guidelines.md)
- [Auth And Routing](./auth-and-routing.md)
- [Hook Guidelines](./hook-guidelines.md)
- [State Management](./state-management.md)
- [Type Safety](./type-safety.md)
- [Quality Guidelines](./quality-guidelines.md)
