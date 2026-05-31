# @superset/host-service Backend Package Guidelines

## Scope
Local Hono service, host SQLite DB, git/filesystem/chat runtimes, terminal WebSockets, event bus, daemon supervisor, and host-service tRPC routers.

## Source Examples
- `packages/host-service/src/app.ts` composes API clients, DB, GitWatcher, EventBus, runtime managers, terminal routes, and tRPC context.
- `packages/host-service/src/trpc/router/router.ts` mounts local routers.
- `packages/host-service/src/terminal/terminal.ts` bridges workspace terminal WebSockets to pty-daemon sessions.
- `packages/host-service/src/daemon/DaemonSupervisor.ts` supervises daemon lifecycle.
- `packages/host-service/test/integration/*.integration.test.ts` covers local service workflows.

## Local Patterns
- Keep production construction in `createApp` but make every external dependency injectable for tests.
- Use provider interfaces under `src/providers` for auth, host auth, credentials, and model resolution.
- Keep runtime managers under `src/runtime/<domain>`; routers should orchestrate but not own long-running runtime state.
- Protect WebSocket routes with `hostAuth`; remote-control uses session HMAC inside its route rather than the generic `/terminal/*` auth middleware.
- Maintain Electron isolation. `src/no-electron-coupling.test.ts` should keep passing.

## Cross-Package Contracts
- Desktop main starts and coordinates host-service; renderer uses typed clients, not direct server imports.
- Host-service consumes pty-daemon protocol and should not import daemon internals beyond public exports.

## Avoid
- Do not import Electron APIs into host-service.
- Do not block startup on optional background sweeps.
- Do not add cloud-only database assumptions to the host SQLite schema.

## Validation
- `bun --cwd packages/host-service test` for unit tests.
- Run targeted `packages/host-service/test/integration/*` tests for workflow changes.
- `bun --cwd packages/host-service typecheck`.
