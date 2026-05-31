# Monorepo Standards

## Workspace Meaning
In this repository, workspace means the isolated Superset git-worktree checkout you are running in. Do not assume it means an editor workspace.

## Commands
- Use Bun for package operations. Do not introduce npm, yarn, or pnpm lockfiles or scripts.
- Use Turbo/root scripts for broad checks: `bun run lint`, `bun run lint:fix`, `bun run format`, `bun run typecheck`, `bun test`, and `bun build`.
- Biome runs at the repository root. `bun run lint:fix` maps to `biome check --write --unsafe`; `bun run lint` is check-only and CI treats warnings as failures.
- Prefer package scripts for tight validation while iterating, then run the root command that matches the blast radius.
- Prefer `gh` for GitHub operations such as PRs and issues when available.

## File Placement
- Implementation plans belong in `plans/` for cross-cutting work or `apps/<app>/plans/` for app-scoped work. Move shipped plans to `plans/done/`.
- Architecture and reference docs belong in `<app>/docs/` or an existing docs directory. Do not drop `*_PLAN.md` at an app root or inside `src/`.
- Shared agent commands live in `.agents/commands/`; skills live in `.agents/skills/`. Keep `.claude/commands` and `.cursor/commands` symlinked to `../.agents/commands`; keep `.claude/skills` symlinked to `../.agents/skills`.
- Shared MCP config lives in `.mcp.json`. `.cursor/mcp.json` links to `../.mcp.json`; Codex uses `.codex/config.toml`; OpenCode mirrors the same server set in `opencode.json`.

## Dependency Rules
- Use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarballs, local overrides, or patch steps unless explicitly requested.
- Keep package exports explicit in `package.json`. Follow examples like `@superset/auth`, `@superset/shared`, `@superset/workspace-fs`, and `@superset/ui`.
- Avoid `any`. Prefer inferred Drizzle/tRPC/router types, Zod schemas, discriminated unions, and package-exported types.

## Questions And Confirmations
When the host exposes a Superset interactive question tool such as `ask_user` or an equivalent overlay, use it for every user question, including yes/no confirmations. Plain text questions are easy for the UI to miss.

## Source Examples
- `AGENTS.md` defines the repo-wide command, migration, package-manager, and question-tool rules.
- `apps/desktop/AGENTS.md` and `apps/desktop/CLAUDE.md` define desktop IPC and renderer gotchas.
- `apps/mobile/AGENTS.md` defines the Expo route/screen split.
- `package.json` at the root owns the root quality commands.
