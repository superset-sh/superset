# @superset/relay Frontend Package Guidelines

## Scope
Relay URLs and status contracts consumed by desktop, host-service, and remote-control viewers.

## Source Examples
- `apps/relay/src/types.ts` defines relay types.
- `packages/workspace-client/src/lib/primeRelayAffinity.ts` consumes relay affinity behavior.
- `packages/host-service/src/tunnel/tunnel-client.ts` connects host-service to relay.

## Local Patterns
- Keep relay client-visible payloads serializable and version-tolerant.
- Coordinate tunnel protocol changes with `@superset/shared` and host-service tunnel client.

## Avoid
- Do not expose internal directory state as a public UI contract.
- Do not duplicate relay URL construction in multiple apps.

## Validation
- `bun --cwd apps/relay typecheck`
- Run host-service/desktop typecheck for contract changes.
