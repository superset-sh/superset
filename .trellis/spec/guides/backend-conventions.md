# Backend Conventions

## tRPC And API Boundaries
- Define procedures with Zod input schemas and explicit `TRPCError` failures. `packages/trpc/src/trpc.ts` is the shared cloud tRPC base.
- Use `protectedProcedure`, `jwtProcedure`, or `adminProcedure` rather than re-implementing auth checks.
- Scope organization resources with helpers such as `requireActiveOrgId`, `requireOrgResourceAccess`, and `requireOrgScopedResource` from `packages/trpc/src/router/utils/`.
- Add router files as `router/<domain>/<domain>.ts` plus `router/<domain>/index.ts`, then mount them in `packages/trpc/src/root.ts`.
- Host-service has its own Hono/tRPC router stack under `packages/host-service/src/trpc/router`; keep cloud API concerns in `packages/trpc` and local machine concerns in host-service.

## Runtime Construction
- `packages/host-service/src/app.ts` is the local service composition root. Build dependencies there, but keep test overrides injectable through `CreateAppOptions`.
- Host-service routes should receive runtime managers through context instead of importing Electron. `packages/host-service/src/no-electron-coupling.test.ts` guards this boundary.
- Background work that can fail during startup should be idempotent and logged, not allowed to block server startup. `runMainWorkspaceSweep` is started with `void ...catch(...)`.
- CLI code should parse and validate at the command boundary, then call typed library functions. See `packages/cli/src/lib/auth.ts`, `packages/cli/src/lib/resolve-auth.ts`, and `packages/cli-framework/src/parser.ts`.

## Errors And Logging
- Use `TRPCError` for client-facing tRPC failures with stable codes and actionable messages.
- Return sanitized form/action errors to users; log provider details server-side. `apps/marketing/src/app/contact/actions.ts` is the local pattern.
- Use `console.warn` or `console.error` for background service failures when no structured logger is present, with a package prefix such as `[host-service]` or function name.
- Keep low-level protocol errors typed and machine-readable when they cross process boundaries, as in `packages/pty-daemon/src/protocol/messages.ts`.

## Testing
- Use `bun test` for most package tests. Unit tests are common beside source files, for example `packages/trpc/src/router/task/task.test.ts` and `packages/host-service/src/events/event-bus.test.ts`.
- Host-service integration tests live under `packages/host-service/test/integration/` and rely on injected dependencies to avoid accidental network or Electron coupling.
- Node-specific PTY daemon integration runs under Node, not Bun, because node-pty runtime behavior is Node-dependent.
