# @superset/auth Backend Package Guidelines

## Scope
Better Auth server configuration, session organization state, billing hooks, Resend email helpers, and auth-related utilities.

## Source Examples
- `packages/auth/src/server.ts` wires Better Auth plugins and exported server auth.
- `packages/auth/src/lib/resolve-session-organization-state.ts` keeps organization selection logic pure and tested.
- `packages/auth/src/lib/rate-limit.ts` and `resend.ts` isolate provider integrations.
- `packages/auth/src/stripe.ts` keeps Stripe auth/billing integration at the auth boundary.

## Local Patterns
- Export server-only auth through `@superset/auth/server`; do not make app packages reach into auth internals.
- Keep session and organization resolution in pure helpers with co-located tests before wiring it into Better Auth callbacks.
- Use `env.ts` for environment validation; do not read raw env vars in call sites.
- Provider failures should return stable auth errors and log details server-side.

## Cross-Package Contracts
- `packages/trpc/src/trpc.ts` and app `proxy.ts` files consume the auth server export.
- `packages/db/src/schema/auth.ts` owns auth database tables; auth code should not create migrations directly.

## Avoid
- Do not duplicate session parsing in apps; use the package export.
- Do not bypass rate limiting for invitation or email flows.
- Do not add provider secrets outside `env.ts` schemas.

## Validation
- `bun --cwd packages/auth test`
- `bun --cwd packages/auth typecheck`
