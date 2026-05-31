# Backend Data And TRPC

## Drizzle And Database Ownership

`packages/db` owns PostgreSQL schema, relations, enum values, zod helpers, and the Neon clients. `packages/local-db` owns desktop SQLite schema. Edit schema files first; do not manually edit generated files in `packages/db/drizzle/` or `packages/local-db/drizzle/`.

Reference files:
- `packages/db/src/schema/schema.ts`
- `packages/db/src/schema/auth.ts`
- `packages/db/src/schema/enums.ts`
- `packages/db/drizzle.config.ts`
- `packages/local-db/src/schema/schema.ts`
- `packages/local-db/drizzle.config.ts`

Production schema work requires a new Neon branch and Drizzle-generated migration. Never touch production data unless the user explicitly asks and confirms.

`packages/db/src/env.ts` intentionally uses `skipValidation: true` because `@superset/db` is imported by runtimes that may not have database env vars. Validate at the client usage boundary, not on package import.

## API TRPC

`packages/trpc/src/trpc.ts` defines the shared tRPC context, `publicProcedure`, `protectedProcedure`, `jwtProcedure`, and `adminProcedure`. Add routers under `packages/trpc/src/router/<domain>` and register them in `packages/trpc/src/root.ts`.

Use zod input schemas at procedure boundaries. Use `TRPCError` for user-facing authorization and validation failures. For organization-scoped resources, reuse helpers in `packages/trpc/src/router/utils/active-org.ts` and `org-resource-access.ts` instead of duplicating membership checks.

Cloud tRPC is exposed by `apps/api/src/app/api/trpc/[trpc]/route.ts`; its context is built in `apps/api/src/trpc/context.ts` from Better Auth sessions and OAuth bearer JWTs.

## Host Service TRPC

`packages/host-service/src/app.ts` builds a Hono app, event bus, filesystem runtime, git runtime, pull-request runtime, terminal routes, and host-service tRPC router. Host-service is intentionally Electron-free; `packages/host-service/src/no-electron-coupling.test.ts` guards against Electron imports and globals.

Host-service routers live under `packages/host-service/src/trpc/router/*` and receive runtime services through context. Keep Electron-specific startup, window, tray, and app lifecycle code in `apps/desktop/src/main`.

## Electron IPC TRPC

Desktop main-to-renderer IPC uses tRPC under `apps/desktop/src/lib/trpc`. `apps/desktop/AGENTS.md` requires tRPC for Electron IPC. With `trpc-electron`, subscriptions must return `observable(...)`; async generators are not supported by the IPC transport.

## Relay And Electric Proxy

`apps/relay` is a Hono service that authenticates JWTs, owns tunnel routing, and redacts sensitive query tokens before logging. `apps/electric-proxy` is a Cloudflare Worker that verifies JWTs and builds organization-scoped Electric shape filters with Drizzle query builders.

## Error And Logging Patterns

Prefer typed errors at boundaries and short, contextual `console.error` or `console.warn` messages for background services. Examples include `packages/host-service/src/app.ts` best-effort cleanup logs and `apps/relay/src/index.ts` token-redacted request logging.
