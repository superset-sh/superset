# Error Handling

## Rules

- Use `TRPCError` for expected tRPC procedure failures.
- Return typed domain results when callers need to distinguish recoverable outcomes.
- Keep cleanup best-effort blocks isolated so one cleanup failure does not skip the rest.
- In desktop renderer UI, rendered errors must be selectable with `select-text cursor-text`.
- Do not swallow unexpected errors silently; log enough context to reproduce without leaking secrets.

## Examples

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/lib/trpc/routers/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx`
