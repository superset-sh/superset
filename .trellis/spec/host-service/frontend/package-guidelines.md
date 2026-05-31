# @superset/host-service Frontend Package Guidelines

## Scope
Client-facing host-service contracts used by desktop renderer, CLI, and workspace clients.

## Source Examples
- `packages/host-service/src/api/createApiClient/createApiClient.ts` wraps cloud API access.
- `packages/host-service/src/events/types.ts` defines event bus payloads.
- `packages/host-service/src/types.ts` exports service contracts.
- `apps/desktop/src/renderer/lib/host-service-client.ts` consumes host-service from the renderer side.

## Local Patterns
- Keep exported types and route payloads stable and serializable.
- Add event kinds in the host-service event type map and update all consumers together.
- Renderer-facing errors should be actionable and copyable in desktop UI.

## Avoid
- Do not leak raw provider credentials into renderer contracts.
- Do not make renderer code depend on host-service private file paths.

## Validation
- `bun --cwd packages/host-service typecheck`
- Run desktop typecheck when exported host contracts change.
