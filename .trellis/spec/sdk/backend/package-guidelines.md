# @superset/sdk Backend Package Guidelines

## Scope
TypeScript SDK core request machinery, generated-style resources, upload helpers, platform shims, and public package build.

## Source Examples
- `packages/sdk/src/client.ts` and `src/index.ts` define public SDK entry points.
- `packages/sdk/src/core/resource.ts` and `api-promise.ts` define resource base behavior.
- `packages/sdk/src/internal/parse.ts`, `request-options.ts`, and `errors.ts` own request internals.
- `packages/sdk/src/resources/*.ts` define resource groups such as agents, automations, hosts, projects, tasks, and workspaces.

## Local Patterns
- Keep public exports stable and generated-friendly.
- Use internal helpers for request parsing, headers, uploads, and platform detection instead of duplicating fetch logic in resources.
- Keep resource methods thin wrappers around core request behavior.
- Update `api.md` and README when public SDK behavior changes.

## Avoid
- Do not leak internal shim types into the public API.
- Do not make SDK resources depend on app-specific runtime globals.
- Do not skip build validation for publishable API changes.

## Validation
- `bun --cwd packages/sdk typecheck`
- `bun --cwd packages/sdk build` for public API/build changes.
