# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after edits that affect source files.
- Run `bun run lint` before pushing; warnings fail CI.
- Run focused tests for touched packages and `bun run typecheck` for broad type changes.
- Keep tests co-located with logic-heavy components, hooks, parsers, stores, and utilities.
- For desktop-facing flows that cross auth, routing, Electron IPC, persisted state, host-service, terminal, or multi-pane runtime behavior, define and run Desktop Automation CLI acceptance per `.trellis/spec/guides/desktop-acceptance-tdd.md`, or record why lower-level tests are sufficient.

## Review Checklist

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.
- Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.
- Prefer non-brittle acceptance assertions: route/hash state, accessible labels/roles, persisted files/state, service probes, Desktop Automation CLI `wait-for` checks, and screenshot/report artifacts. Avoid CSS class or deep DOM selectors for desktop gates.

## Clone Progress Contract

- Scope / trigger: desktop clone UX changes must cover both entry points, not only workspace creation. `New Workspace` can use workspace creation progress, while `Add repository -> Clone a repository` uses `project.create` through `NewProjectModal`.
- Signature: the project clone path passes `progressRequestId` into `client.project.create.mutate(...)` and listens for `project:create-progress` events on the host-service event bus keyed by the same request id.
- Contract: visible progress must appear in the modal while it is open, and a persistent toast must continue updating after the user hides the modal. Hiding the modal must not cancel the clone.
- Validation / errors: clone failures should replace the progress toast with a readable error and should not leak raw SQL error envelopes into the renderer UI.
- Good: E2E the actual `Add repository -> Clone from URL` modal with a large enough repo to observe `Receiving objects` progress, then click `Hide` and verify progress continues in the toast.
- Bad: only testing `New Workspace` creation progress and assuming the repository modal uses the same path.
- Tests required: add or update a source/unit test that asserts `NewProjectModal` passes `progressRequestId`, subscribes to `project:create-progress`, renders progress text/percent, and exposes `Hide` while work continues.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
