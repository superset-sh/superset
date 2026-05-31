# @superset/workspace-client Frontend Package Guidelines

## Scope
React Query/tRPC workspace client exports consumed by renderer and web-like clients.

## Source Examples
- `packages/workspace-client/src/index.ts` exports the package surface.
- `packages/workspace-client/package.json` declares React Query and tRPC peer/client dependencies.

## Local Patterns
- Keep React-facing client helpers compatible with React peer dependency.
- Use exported hooks/clients rather than deep imports from apps.
- Coordinate cache behavior with consuming route providers.

## Avoid
- Do not import desktop renderer components into the client package.
- Do not create app-specific query keys here unless they are shared.

## Validation
- `bun --cwd packages/workspace-client typecheck`
- Run consuming app typecheck for client API changes.
