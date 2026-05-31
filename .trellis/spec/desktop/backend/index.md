# Backend Guidelines: apps/desktop

Electron desktop app. This is the primary package for v2 workspace refactors.

## Read First

- Follow the repo-wide guide: `.trellis/spec/guides/superset-engineering-guide.md`.
- For desktop-facing behavior that crosses Electron, host-service, terminal, or local persistence boundaries, follow `.trellis/spec/guides/desktop-acceptance-tdd.md`.
- Follow root `AGENTS.md` and any nearer package `AGENTS.md`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`

## Guide Index

- [Directory Structure](./directory-structure.md)
- [Database Guidelines](./database-guidelines.md)
- [Error Handling](./error-handling.md)
- [Logging Guidelines](./logging-guidelines.md)
- [Quality Guidelines](./quality-guidelines.md)
