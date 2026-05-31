# @superset/relay Backend Package Guidelines

## Scope
Hono Node relay service for tunnels, WebSocket routing, access/auth, directory state, Sentry, and deployment scripts.

## Source Examples
- `apps/relay/src/index.ts` is the service entry point.
- `apps/relay/src/tunnel.ts` owns tunnel behavior.
- `apps/relay/src/auth.ts` and `access.ts` validate access.
- `apps/relay/src/directory.ts` tracks relay directory state.
- `apps/relay/plans/20260420-relay-hardening.md` documents hardening context.

## Local Patterns
- Keep relay auth/access checks close to tunnel handling.
- Use shared tunnel protocol types from `@superset/shared` where possible.
- Keep deployment changes in `fly*.toml` and scripts under `scripts/`.
- Add smoke checks when changing tunnel routing or auth.

## Avoid
- Do not bypass relay access checks for synthetic or debug routes.
- Do not mix host-service local auth secrets into cloud relay config without explicit protocol design.

## Validation
- `bun --cwd apps/relay typecheck`
- `apps/relay/scripts/smoke-test.sh` for relay behavior changes when environment is available.
