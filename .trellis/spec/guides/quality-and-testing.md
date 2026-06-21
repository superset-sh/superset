# Quality And Testing

## Baseline Checks

Use root checks before pushing broad changes:

- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`
- `bun test`

For focused packages, run the closest script first. Examples:

- `bun run --cwd apps/desktop test`
- `bun run --cwd packages/host-service test`
- `bun run --cwd packages/pty-daemon test`
- `bun run --cwd packages/pty-daemon test:integration`
- `bun run --cwd packages/workspace-fs test`
- `bun run --cwd packages/shared test`

For desktop-facing product behavior, also read `desktop-acceptance-tdd.md` during planning. User-visible desktop changes should name either the Desktop Automation CLI acceptance path that proves the flow or the reason lower-level tests are sufficient.

## Biome Rules

Biome is configured at `biome.jsonc` and should be run from the root. Renderer code has a stricter import boundary that rejects Node builtins and host filesystem implementations. CLI packages intentionally relax `noExplicitAny` and non-null assertion rules because the CLI framework parser types need those escape hatches.

## Type Safety

The shared TypeScript config in `tooling/typescript/base.json` is strict and enables `noUncheckedIndexedAccess`. Prefer inferred types from tRPC routers, Drizzle `$inferSelect/$inferInsert`, and zod schemas. Avoid `any` unless a local config or package wrapper has already documented why the library type cannot express the overload.

## Test Style

Most packages use `bun:test` for unit tests. `packages/pty-daemon` uses Bun for pure unit tests and Node integration tests for real PTY behavior because `node-pty` is not reliable under Bun. `packages/host-service` has node-marked integration tests for daemon and adoption scenarios.

Source-level regression tests are accepted when the bug was missing wiring that is hard to exercise through a full UI mount. Examples:
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/TasksView.test.ts`
- `packages/host-service/src/no-electron-coupling.test.ts`

Desktop Automation CLI real app checks are required when the risk lives across Electron main/preload/renderer, persisted desktop state, route guards, host-service, or native process boundaries. They should combine deterministic assertions with screenshot/report artifacts; do not rely on visual-only checks as the gate.

## Background Services

Long-lived services must clean up best-effort and independently. `packages/host-service/src/app.ts` isolates cleanup steps so one failed stop does not leak the rest. `apps/relay/src/index.ts` drains tunnels on SIGINT and SIGTERM before process exit.

## Local Dev Service Contracts

Local dev setup must keep `.env`, Docker published ports, and generated service files in sync. Setup scripts should replace their managed `.env` block instead of appending another copy, and should treat existing Docker port mappings as the source of truth after a stack has been created. For local Neon HTTP proxy URLs, prefer `localhost` over `db.localtest.me`; `db.localtest.me` can resolve away from loopback on this machine and cause `fetch failed` auth/database errors.

For worktree-local desktop or E2E validation, prefer the lifecycle scripts over hand-starting processes: `bun run dev:worktree:start`, `bun run dev:worktree:status`, `bun run dev:worktree:stop`, and `bun run dev:worktree:cleanup -- --e2e-slug <slug> [--worktree-name <dir-name>]`. Seed disposable workspace/project rows with `bun run e2e:workspace-fixture -- seed ...` and clean them with `bun run e2e:workspace-fixture -- cleanup --slug <slug>` or the lifecycle cleanup command. See `desktop-acceptance-tdd.md` for the full contract.

Worktree setup tests should cover two same-named physical worktree paths producing different compose projects, stale managed `.env` detection, and refusal of non-local critical URLs before migrations, seed, stop, or cleanup.

When changing dev, worktree, online, Electric, Redis/KV, or relay startup scripts, validate the actual runtime contract, not just process existence:

- API auth/session endpoint responds.
- Neon HTTP proxy can execute a real SQL query.
- Electric proxy returns the expected auth-gated response.
- Relay health responds.
- Redis/KV URL matches the Docker-published host port.
- Desktop renderer reaches the sign-in or authenticated route without repeated renderer errors.

## Final Pass

Before finishing spec or doc work, search `.trellis/spec` for generated scaffold language and stale status markers. The docs should describe this repository with concrete paths, not generic framework advice.
