# Error Handling

## Rules

- Use `TRPCError` for expected tRPC procedure failures.
- Return typed domain results when callers need to distinguish recoverable outcomes.
- Keep cleanup best-effort blocks isolated so one cleanup failure does not skip the rest.
- In desktop renderer UI, rendered errors must be selectable with `select-text cursor-text`.
- Do not swallow unexpected errors silently; log enough context to reproduce without leaking secrets.

## Examples

- `packages/chat/src/server/trpc/service.ts`
- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`
