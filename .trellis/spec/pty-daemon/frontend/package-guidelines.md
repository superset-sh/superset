# @superset/pty-daemon Frontend Package Guidelines

## Scope
Public protocol types and client-facing terminal session semantics consumed by host-service and desktop renderer.

## Source Examples
- `packages/pty-daemon/src/index.ts` controls public exports.
- `packages/pty-daemon/src/protocol/index.ts` exports protocol helpers.
- `apps/desktop/src/main/terminal-host/*.ts` and host-service terminal routes consume terminal session semantics.

## Local Patterns
- Keep protocol types explicit and discriminated by `type`.
- Update host-service and renderer consumers when adding a server/client message.
- Document byte-level behavior in code comments and tests because UI regressions are otherwise subtle.

## Avoid
- Do not expose daemon-private SessionStore state as a UI contract.
- Do not let renderer code depend on daemon filesystem paths.

## Validation
- `bun --cwd packages/pty-daemon typecheck`
- Run host-service and desktop terminal tests for protocol changes.
