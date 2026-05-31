# Superset Project Guides

These guides capture conventions that apply across packages. Package indexes link back here when a rule is shared rather than package-specific.

| Guide | Use When |
| --- | --- |
| [Monorepo Standards](./monorepo-standards.md) | Starting any repo work, choosing commands, or placing docs and plans. |
| [Monorepo Conventions](./monorepo-conventions.md) | Needing deeper command, package-boundary, Biome, Turbo, or dependency context. |
| [Superset Engineering Guide](./superset-engineering-guide.md) | Needing a single broad summary imported from AGENTS and current code layout. |
| [Frontend Conventions](./frontend-conventions.md) | Editing React, Next.js, Expo, Tailwind, shadcn, or TanStack DB code. |
| [Backend Conventions](./backend-conventions.md) | Editing tRPC, Hono, CLI, MCP, host-service, SDK, worker, or service code. |
| [Backend Data And TRPC](./backend-data-and-trpc.md) | Needing deeper Drizzle, cloud tRPC, host-service tRPC, relay, or Electric proxy details. |
| [Database And Migrations](./database-and-migrations.md) | Editing Drizzle schemas, database clients, or generated migration boundaries. |
| [Desktop Conventions](./desktop-conventions.md) | Editing Electron main/preload/renderer, desktop v2 workspace UI, or terminal boundaries. |
| [Terminal And Host Runtime](./terminal-and-host-runtime.md) | Editing terminal, host-service, pty-daemon, relay, remote-control, or daemon code. |
| [Quality And Testing](./quality-and-testing.md) | Choosing focused checks, root checks, source-level regression tests, or service cleanup validation. |
| [Desktop Acceptance TDD](./desktop-acceptance-tdd.md) | Planning or validating desktop-facing requirements that need real Electron startup, automation, screenshots, or non-brittle acceptance gates. |
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Adding helpers, constants, config, or repeated logic. |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Changing payloads, events, DB rows, RPC contracts, or UI data flow across layers. |

Run the relevant package validation from the package guide, then run root `bun run lint` before pushing.
