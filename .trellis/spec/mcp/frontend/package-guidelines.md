# @superset/mcp Frontend Package Guidelines

## Scope
Client-safe MCP types and package exports consumed by API or UI surfaces.

## Source Examples
- `packages/mcp/package.json` exposes `.`, `./auth`, and `./in-memory`.
- `apps/api/package.json` depends on `@superset/mcp`.

## Local Patterns
- Keep exports intentional and typed. Do not expose server internals accidentally.
- Prefer shared types over UI-local tool payload definitions.

## Avoid
- Do not import Node-only server setup into browser bundles.
- Do not duplicate MCP auth payload shapes in app code.

## Validation
- `bun --cwd packages/mcp typecheck`
- Run consuming app typecheck when exports change.
