# Backend Guidelines: packages/host-service

Local host runtime for v2 projects/workspaces, terminal sessions, git, chat, and relay.

## Read First

- Follow the repo-wide guide: `.trellis/spec/guides/superset-engineering-guide.md`.
- Follow root `AGENTS.md` and any nearer package `AGENTS.md`.
- This package's generated Trellis specs document current conventions. Match existing code before inventing new abstractions.

## Local Examples

- `packages/host-service/src/app.ts`
- `packages/host-service/src/trpc/router/project/handlers.ts`
- `packages/host-service/src/terminal/terminal.ts`
- `packages/host-service/src/daemon/DaemonSupervisor.ts`

## Guide Index

- [Directory Structure](./directory-structure.md)
- [Database Guidelines](./database-guidelines.md)
- [Error Handling](./error-handling.md)
- [Logging Guidelines](./logging-guidelines.md)
- [Quality Guidelines](./quality-guidelines.md)
