# Error Handling

## Rules

- Use `TRPCError` for expected tRPC procedure failures.
- Return typed domain results when callers need to distinguish recoverable outcomes.
- Keep cleanup best-effort blocks isolated so one cleanup failure does not skip the rest.
- In desktop renderer UI, rendered errors must be selectable with `select-text cursor-text`.
- Do not swallow unexpected errors silently; log enough context to reproduce without leaking secrets.

## Examples

- `packages/trpc/src/root.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `packages/trpc/src/router/chat/chat.ts`
