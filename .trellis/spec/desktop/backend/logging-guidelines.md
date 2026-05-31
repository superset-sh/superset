# Logging Guidelines

## Rules

- Log operational events at the layer that owns the runtime.
- Prefer structured logs for daemon/host-service lifecycle events where possible.
- Include identifiers such as organizationId, workspaceId, terminalId, or host id when they are safe and useful.
- Never log auth tokens, provider credentials, host-service secrets, refresh tokens, or user private content.
- Best-effort cleanup warnings should be warnings, not thrown errors that abort unrelated cleanup.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
