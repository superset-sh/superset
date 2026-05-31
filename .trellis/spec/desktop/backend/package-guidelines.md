# @superset/desktop Backend Package Guidelines

## Scope
Electron main process, packaged host-service/pty-daemon coordination, main-process tRPC routers, preload bridge, terminal host, auto update, menus, and OS integrations.

## Source Examples
- `apps/desktop/AGENTS.md` and `CLAUDE.md` define desktop-specific IPC and error-selection rules.
- `apps/desktop/src/lib/trpc/routers/index.ts` composes Electron IPC routers.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates host-service lifecycle.
- `apps/desktop/src/main/terminal-host/terminal-host.ts` and tests own main-process terminal hosting.
- `apps/desktop/src/preload/index.ts` is the renderer bridge boundary.

## Local Patterns
- Use tRPC for Electron IPC; do not add ad hoc IPC channels.
- For `trpc-electron` subscriptions, use `observable` from `@trpc/server/observable`, not async generators.
- Use aliases from `tsconfig.json` where possible.
- Keep host-service and pty-daemon lifecycle code in main process libraries, not renderer components.
- Add focused tests for OS/process/terminal behavior under `src/main/**/*.test.ts`.

## Cross-Package Contracts
- Host-service local runtime belongs in `packages/host-service`; desktop main coordinates it.
- Pty daemon protocol belongs in `packages/pty-daemon`; desktop packages and supervises it.

## Avoid
- Do not bypass tRPC for new Electron IPC.
- Do not put renderer-only state in main-process modules.
- Do not decode terminal byte streams in ways that break UTF-8 or binary fidelity.

## Validation
- `bun --cwd apps/desktop test`
- `bun --cwd apps/desktop typecheck`
