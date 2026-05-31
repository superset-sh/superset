# electric-proxy Backend Package Guidelines

## Scope
Cloudflare Worker proxy for Electric SQL shapes, authentication, where-clause handling, and Electric client access.

## Source Examples
- `apps/electric-proxy/src/index.ts` is the Worker entry.
- `apps/electric-proxy/src/auth.ts` validates access.
- `apps/electric-proxy/src/electric.ts` integrates Electric client behavior.
- `apps/electric-proxy/src/where.ts` builds/validates where constraints.
- `apps/electric-proxy/wrangler.jsonc` configures deployment.

## Local Patterns
- Keep Worker code runtime-compatible with Cloudflare Workers.
- Validate auth and shape filters before forwarding to Electric.
- Use shared DB schema names from `@superset/db` instead of stringly typed table copies where possible.
- Keep request/response types in `types.ts`.

## Avoid
- Do not use Node-only APIs in Worker runtime.
- Do not expose unrestricted Electric shapes without auth and where scoping.

## Validation
- `bun --cwd apps/electric-proxy typecheck`
- `bun --cwd apps/electric-proxy deploy` only when explicitly releasing.
