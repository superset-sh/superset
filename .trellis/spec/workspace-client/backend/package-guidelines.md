# @superset/workspace-client Backend Package Guidelines

## Scope
Typed host-service/workspace client helpers, event bus client, relay affinity priming, and workspace tRPC bridge.

## Source Examples
- `packages/workspace-client/src/workspace-trpc.ts` defines workspace tRPC client integration.
- `packages/workspace-client/src/lib/eventBus.ts` owns event bus client behavior.
- `packages/workspace-client/src/lib/primeRelayAffinity.ts` handles relay affinity priming.

## Local Patterns
- Keep host-service communication typed and routed through this package where shared clients are needed.
- Use superjson/tRPC clients consistently with host-service contracts.
- Keep relay affinity logic isolated so UI callers do not need tunnel details.

## Avoid
- Do not duplicate host-service client setup in multiple apps.
- Do not expose raw auth tokens through event bus helpers.

## Validation
- `bun --cwd packages/workspace-client typecheck`
