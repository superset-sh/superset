# @superset/panes Frontend Package Guidelines

## Scope
React DnD pane components and hooks built on the core pane model.

## Source Examples
- `packages/panes/src/react/index.ts` exports React integration.
- `packages/panes/src/react/types.ts` defines React-specific pane types.
- `packages/panes/package.json` declares React peer dependency and `react-dnd` usage.

## Local Patterns
- Keep React-specific behavior under `src/react`.
- Use `@superset/ui` shared components when rendering reusable controls.
- Keep drag/drop state predictable and externally controlled where possible.

## Avoid
- Do not couple React pane code to a single app route.
- Do not duplicate core pane types in desktop stores.

## Validation
- `bun --cwd packages/panes test`
- `bun --cwd packages/panes typecheck`
