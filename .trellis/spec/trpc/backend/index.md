# Backend Guidelines: packages/trpc

Cloud API tRPC routers and shared server/client wiring.

## Read First

- Follow the repo-wide guide: `.trellis/spec/guides/superset-engineering-guide.md`.
- Follow root `AGENTS.md` and any nearer package `AGENTS.md`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

- `packages/trpc/src/root.ts`
- `packages/trpc/src/router/v2-workspace/v2-workspace.ts`
- `packages/trpc/src/router/chat/chat.ts`

## Guide Index

- [Directory Structure](./directory-structure.md)
- [Database Guidelines](./database-guidelines.md)
- [Automation Run Workflow](./automation-run-workflow.md)
- [Error Handling](./error-handling.md)
- [Logging Guidelines](./logging-guidelines.md)
- [Quality Guidelines](./quality-guidelines.md)
