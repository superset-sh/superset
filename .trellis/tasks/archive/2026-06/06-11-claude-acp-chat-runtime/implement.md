# Implementation plan

## Phase 1: runtime adapter

1. Add a small standalone provider adapter abstraction under `packages/chat/src/server/trpc/`.
2. Add a Claude adapter backed by `@anthropic-ai/claude-agent-sdk` when available.
3. Map Claude SDK stream messages into Superset events: assistant text, reasoning, done, error.
4. Enable Claude Code tools by default in Auto mode and pass permission mode through the send metadata.
5. Preserve the existing standalone runtime contract: `sendMessage`, `getDisplayState`, `listMessages`, `restartFromMessage`, `abort`.
6. Persist final assistant text and reasoning parts into cloud `chat_messages`.

## Phase 2: schema and router contract

1. Extend Chat message content validation for reasoning parts.
2. Update Drizzle schema only if needed.
3. Do not manually edit generated migration SQL/meta files; if schema changes require a migration, leave generation as an explicit follow-up command.

## Phase 3: UI controls and state

1. Ensure standalone Chat has model/thinking controls in the composer.
2. Pass selected model and thinking metadata through `sendMessage`.
3. Keep sidebar optimistic session creation and first-message title updates.
4. Keep thinking visible after the assistant turn completes.

## Phase 4: validation

Focused checks:

- `bun test packages/chat/src/server/trpc/standalone-runtime.test.ts`
- `bun --filter @superset/chat typecheck`
- `bun --filter @superset/desktop typecheck`
- `bun run lint`

Desktop acceptance:

- Start local service graph and desktop dev.
- Use Desktop Automation CLI to open `/chat`, select a Claude-compatible model/thinking option if available, send a prompt, verify visible streaming/history, and capture screenshot/report artifacts under this task.

## Rollback points

- If Claude SDK process launch fails in development, keep adapter tests passing with an injectable fake adapter and surface a runtime setup error in real UI.
- If packaged runtime dependency bundling is uncertain, keep packaging validation as a release gate before pushing a canary.
