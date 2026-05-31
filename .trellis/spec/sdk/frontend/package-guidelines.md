# @superset/sdk Frontend Package Guidelines

## Scope
Browser/client consumption of the SDK public API and resource types.

## Source Examples
- `packages/sdk/src/resources/index.ts` exports public resources.
- `packages/sdk/src/internal/detect-platform.ts` handles runtime platform detection.

## Local Patterns
- Keep browser-compatible code free of Node-only dependencies unless shims cover them.
- Return typed promises with predictable error classes from `core/error.ts`.
- Use SDK public types rather than duplicating API response shapes in apps.

## Avoid
- Do not import from `src/internal` in app code.
- Do not rely on undocumented resource paths.

## Validation
- `bun --cwd packages/sdk typecheck`
- `bun --cwd packages/sdk build`
