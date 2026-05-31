# State Management

## Rules

- Prefer local React state for view-only state.
- Use feature-local providers/stores when state belongs to one route or workflow.
- Use TanStack Query/tRPC for server calls and invalidation.
- Use Electric/TanStack DB collections cache-first: existing rows stay visible while readiness catches up.
- Persisted local settings should use existing package stores/helpers instead of ad hoc localStorage.

- Desktop renderer stores live under `apps/desktop/src/renderer/stores/` or feature-local `state/` folders.
- V2 workspace document state is feature-local, for example `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore/`.
- Terminal PTY lifetime is owned by host-service / pty-daemon; renderer stores may track UI attachment and pane state but must not become the process owner.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
