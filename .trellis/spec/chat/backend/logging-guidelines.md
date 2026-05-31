# Logging Guidelines

## Rules

- Log operational events at the layer that owns the runtime.
- Prefer structured logs for daemon/host-service lifecycle events where possible.
- Include identifiers such as organizationId, workspaceId, terminalId, or host id when they are safe and useful.
- Never log auth tokens, provider credentials, host-service secrets, refresh tokens, or user private content.
- Best-effort cleanup warnings should be warnings, not thrown errors that abort unrelated cleanup.

## Examples

- `packages/chat/src/server/trpc/service.ts`
- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`
