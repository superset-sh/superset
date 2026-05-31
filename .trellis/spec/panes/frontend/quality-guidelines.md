# Quality Guidelines

## Required Checks

- Run `bun run lint:fix` after edits that affect source files.
- Run `bun run lint` before pushing; warnings fail CI.
- Run focused tests for touched packages and `bun run typecheck` for broad type changes.
- Keep tests co-located with logic-heavy components, hooks, parsers, stores, and utilities.

## Review Checklist

- One component per file. For app-owned components, use `ComponentName/ComponentName.tsx` with an `index.ts` barrel.
- Co-locate dependencies by usage: child components under the parent, hooks/utils/stores/providers next to the feature that owns them, tests next to the implementation.
- Promote code only to the highest shared parent that needs it. Use root `components/` as a last resort for code shared across unrelated pages.
- shadcn/ui and ai-elements are exceptions: keep single kebab-case files under `src/components/ui/` and `src/components/ai-elements/` so generators can update them.
- Prefer existing UI primitives from `@superset/ui` before adding new local component APIs.
- Use icons from the active icon library for icon buttons. Avoid text-only controls where an established icon convention exists.
- Do not hide persisted Electric/TanStack rows while `isReady` or `isLoading` is false; this causes blanking regressions.
- Keep user-facing error text selectable in desktop renderer UI with `select-text cursor-text` when it is rendered in a body subtree with `user-select: none`.

## Examples

- `packages/panes/src/core/store/store.ts`
- `packages/panes/src/react/components/Workspace/Workspace.tsx`
