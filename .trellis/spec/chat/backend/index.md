# Backend Guidelines: packages/chat

Shared chat runtime, desktop auth storage, slash commands, and client hooks.

## Read First

- Follow the repo-wide guide: `.trellis/spec/guides/superset-engineering-guide.md`.
- Follow root `AGENTS.md` and any nearer package `AGENTS.md`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

- `packages/chat/src/server/trpc/service.ts`
- `packages/chat/src/server/desktop/chat-service/chat-service.ts`
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`

## Guide Index

- [Directory Structure](./directory-structure.md)
- [Database Guidelines](./database-guidelines.md)
- [Error Handling](./error-handling.md)
- [Logging Guidelines](./logging-guidelines.md)
- [Quality Guidelines](./quality-guidelines.md)
- [Standalone Chat Runtime](./standalone-chat-runtime.md)
