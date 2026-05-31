# Backend Guidelines: packages/desktop-mcp

Desktop MCP is the project-local automation package for real Electron desktop acceptance checks. Trellis gates use its CLI by default; MCP remains a compatibility surface for hosts that expose local MCP tools directly.

## Read First

- Follow `.trellis/spec/guides/backend-conventions.md` for package and runtime conventions.
- Follow `.trellis/spec/guides/desktop-acceptance-tdd.md` for desktop quality gate expectations.
- Keep this package CDP-only at the automation boundary. It should control the running Electron renderer through CLI or MCP; it must not import Electron main or renderer app modules.

## Local Examples

- `packages/desktop-mcp/src/bin.ts`
- `packages/desktop-mcp/src/cli.ts`
- `packages/desktop-mcp/src/automation/desktop-automation.ts`
- `packages/desktop-mcp/src/mcp/connection/connection-manager.ts`
- `packages/desktop-mcp/src/mcp/tools/index.ts`

## Pre-Development Checklist

- Preserve lazy CDP connection behavior so CLI commands and the MCP server can connect after the desktop app begins starting.
- Keep tool inputs typed with Zod schemas at the MCP boundary.
- Keep CLI parsing small and explicit; do not add a global CLI dependency for this package.
- Prefer non-brittle interaction helpers: URL/hash checks, visible text/roles, selectors discovered through `inspect_dom`, console logs, and screenshot artifacts.
- Do not add global installs or browser downloads; use repo-local Bun dependencies.
- Run `bun test packages/desktop-mcp` and `bun run --cwd packages/desktop-mcp typecheck` after source changes.

## Guide Index

- [Quality Guidelines](./quality-guidelines.md)
