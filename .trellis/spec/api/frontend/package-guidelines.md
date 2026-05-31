# @superset/api Frontend Package Guidelines

## Scope
Next.js API app for tRPC, MCP/OAuth endpoints, instrumentation, proxy, and server-side integration code.

## Source Examples
- `apps/api/src/trpc/context.ts` builds API tRPC context.
- `apps/api/src/proxy.ts` is the Next 16 interception file.
- `apps/api/src/lib/oauth-state.ts`, `oauth-metadata.ts`, and `relay-url.ts` isolate API helpers.
- `apps/api/MCP_TOOLS.md` documents API MCP tool behavior.

## Local Patterns
- Although Trellis labels this layer frontend, treat this app as server-heavy Next API code.
- Keep route handlers under `src/app` and reusable server helpers under `src/lib`.
- Use validated env from `src/env.ts` and Sentry instrumentation files already present.
- Use `proxy.ts`, not `middleware.ts`.

## Avoid
- Do not put browser UI components in this app.
- Do not bypass shared `@superset/trpc`, `@superset/auth`, `@superset/mcp`, or `@superset/mcp-v2` packages for duplicated API logic.

## Validation
- `bun --cwd apps/api typecheck`
- `bun --cwd apps/api build` for route/runtime changes when feasible.
