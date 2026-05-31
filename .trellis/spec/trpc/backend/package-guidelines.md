# @superset/trpc Backend Package Guidelines

## Scope
Cloud application tRPC context, auth procedures, routers, organization resource guards, and inferred router types.

## Source Examples
- `packages/trpc/src/trpc.ts` defines context, superjson transformer, error formatter, and auth procedures.
- `packages/trpc/src/root.ts` mounts all domain routers and exports `RouterInputs`/`RouterOutputs`.
- `packages/trpc/src/router/v2-project/v2-project.ts` shows org-scoped JWT procedures and Drizzle transactions.
- `packages/trpc/src/router/utils/org-resource-access.ts` centralizes access checks.

## Local Patterns
- Use Zod `.input(...)` on procedures and return typed data directly from Drizzle queries.
- Use `TRPCError` with stable codes for auth, validation, and not-found failures.
- Use procedure type by auth mode: `publicProcedure`, `protectedProcedure`, `jwtProcedure`, or `adminProcedure`.
- Keep each router in `router/<domain>/<domain>.ts` plus `index.ts`, then mount it in `root.ts`.
- Use organization access helpers instead of repeating membership checks.

## Cross-Package Contracts
- Apps consume `AppRouter`, `RouterInputs`, and `RouterOutputs` rather than duplicating API types.
- Cloud routers use `@superset/db`; local host-service routers live in `packages/host-service`.

## Avoid
- Do not perform organization-scoped resource reads without verifying org membership/access.
- Do not use raw unvalidated `input` objects.
- Do not put desktop-local workflows in the cloud tRPC package.

## Validation
- `bun --cwd packages/trpc test`
- `bun --cwd packages/trpc typecheck`
