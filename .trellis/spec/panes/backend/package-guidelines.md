# @superset/panes Backend Package Guidelines

## Scope
Runtime-neutral pane model types and layout contracts shared with the React pane implementation.

## Source Examples
- `packages/panes/src/types.ts` owns core pane types.
- `packages/panes/src/index.ts` exposes package entry points.
- `packages/panes/README.md` documents package intent.

## Local Patterns
- Keep core types free of React and DOM dependencies.
- Model pane state with explicit discriminated types so stores can update safely.
- Update React layer and tests when core type contracts change.

## Avoid
- Do not import `@superset/ui` or React into core type files.
- Do not use broad `any` for pane payloads.

## Validation
- `bun --cwd packages/panes test`
- `bun --cwd packages/panes typecheck`
