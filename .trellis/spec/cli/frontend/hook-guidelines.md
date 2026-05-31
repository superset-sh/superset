# Hook Guidelines

## Rules

- Name hooks with `use...` and keep them close to the feature that owns the state or side effect.
- Co-locate hook tests beside hooks when the hook contains branching, cache behavior, routing, or parsing logic.
- For TanStack DB / Electric live queries, render cached `data` first. Do not blank UI only because readiness flags are false.
- For tRPC / React Query hooks, keep query keys and invalidation close to the feature route or provider.
- Keep long-running process state in host-service / daemon layers, not in React hooks.

## Examples

- `packages/cli/package.json`
