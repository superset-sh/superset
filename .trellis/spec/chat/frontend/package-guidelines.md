# @superset/chat Frontend Package Guidelines

## Scope
React chat client provider, display hooks, and shared slash-command parsing used by renderer experiences.

## Source Examples
- `packages/chat/src/client/provider/provider.tsx` wires chat client context.
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts` owns display state.
- `packages/chat/src/shared/slash-command-arguments.ts` and related tests are shared parser utilities.

## Local Patterns
- Keep React providers under `src/client/provider` and export through `src/client/index.ts`.
- Keep display/race behavior in hooks with tests; do not duplicate chat state machines in app components.
- Shared parser utilities must remain runtime-neutral and tested with plain Bun tests.

## Avoid
- Do not import desktop-only server files into client bundles.
- Do not parse slash-command arguments inline in UI components.

## Validation
- `bun --cwd packages/chat test`
- `bun --cwd packages/chat typecheck`
