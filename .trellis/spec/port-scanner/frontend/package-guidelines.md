# @superset/port-scanner Frontend Package Guidelines

## Scope
Typed port information consumed by desktop UI and host-service clients.

## Source Examples
- `packages/port-scanner/src/types.ts` defines exported port/process shapes.
- `apps/desktop/src/renderer` surfaces ports through host-service routes.

## Local Patterns
- Keep exported shapes stable and serializable.
- Convert scanner details into UI-ready copy at the UI boundary, not inside scanner internals.

## Avoid
- Do not import Node process scanning code into browser bundles.
- Do not expose platform-specific raw parser details to UI components.

## Validation
- `bun --cwd packages/port-scanner typecheck`
- Run desktop typecheck when exported types change.
