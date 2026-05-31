# @superset/chat Backend Package Guidelines

## Scope
Mastra-backed desktop and Hono chat service, provider auth, slash-command resolution, and chat tRPC runtime helpers.

## Source Examples
- `packages/chat/src/server/desktop/chat-service/chat-service.ts` owns the desktop chat service.
- `packages/chat/src/server/desktop/slash-commands/registry.ts` and tests define slash-command behavior.
- `packages/chat/src/server/trpc/service.ts` exposes chat service operations through tRPC.
- `packages/chat/src/server/shared/small-model/get-small-model.ts` centralizes small-model selection.

## Local Patterns
- Use upstream `mastracode` and `@mastra/*`; do not add forks or local patch workflows.
- Keep provider auth storage and OAuth flow logic under `server/desktop/auth` and `chat-service`.
- Keep slash-command parsing in `shared/` and resolution/registry work in `server/desktop/slash-commands/`.
- Add tests for parser, registry, runtime creation, and provider auth edge cases.

## Cross-Package Contracts
- Host-service constructs `ChatService` in `packages/host-service/src/app.ts` and proxies provider auth through host-service routers.
- Desktop renderer uses the client provider/hooks from `packages/chat/src/client`.

## Avoid
- Do not put renderer state into server runtime helpers.
- Do not read `.claude/commands` directly outside the slash-command discovery layer.
- Do not silently fall back between model providers without preserving test coverage.

## Validation
- `bun --cwd packages/chat test`
- `bun --cwd packages/chat typecheck`
