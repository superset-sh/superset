# Monorepo Conventions

## Scope

Superset is a Bun and Turbo monorepo with apps under `apps/*`, packages under `packages/*`, and shared TypeScript configs in `tooling/typescript`. The root package manager is Bun 1.3.x; do not introduce npm, yarn, or pnpm lockfiles.

Reference files:
- `package.json`
- `turbo.jsonc`
- `biome.jsonc`
- `bunfig.toml`
- `tooling/typescript/base.json`
- `AGENTS.md`

## Commands

Use root scripts for broad checks because Biome and Turbo are configured at the repo root:

- `bun run lint:fix` runs Biome migrate plus `biome check --write --unsafe .`.
- `bun run lint` treats warnings as failures through `scripts/lint.sh`.
- `bun run typecheck` delegates through Turbo.
- `bun test` delegates package tests through Turbo with concurrency 2.

Run package-local commands only when the change is package-local and the package defines the script. Examples: `bun run --cwd apps/desktop test`, `bun run --cwd packages/pty-daemon test:integration`, `bun run --cwd packages/local-db generate`.

## Package Boundaries

Workspace packages expose source TypeScript through `exports`, for example `@superset/db` exposes `./schema`, `./client`, and `./utils`, while `@superset/ui` exposes shadcn components and custom atoms. Prefer those public exports instead of reaching into another package's private files.

Renderer and browser code must not import Node-only modules. `biome.jsonc` enforces this for `apps/desktop/src/renderer/**`, including a ban on `node:*`, `@superset/workspace-fs/host`, and `@superset/workspace-fs/server`.

## Files And Plans

Component and hook code follows the repo's co-location rule from `AGENTS.md`: one folder per component or hook, `Name.tsx` or `useName.ts`, and `index.ts` next to it. shadcn-owned directories are exceptions: `packages/ui/src/components/ui`, `packages/ui/src/components/ai-elements`, and `apps/mobile/components/ui` use kebab-case single files because their generators expect that shape.

Implementation plans belong in `plans/` or `apps/<app>/plans/`; shipped plans move to `plans/done/`. Architecture docs belong under the owning app's `docs/` directory. Do not add plan documents at an app root or under `src/`.

## Agent And Tooling Source

Shared agent command definitions live in `.agents/commands/`; shared skills live in `.agents/skills/`. `.claude/commands` and `.cursor/commands` should stay symlinks to `../.agents/commands`; `.claude/skills` should stay a symlink to `../.agents/skills`. Shared MCP config lives in `.mcp.json`, with `.cursor/mcp.json` linked to it.

## Dependency Rules

Use published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarball overrides or custom patch steps unless the task explicitly calls for them.

`bunfig.toml` uses isolated installs, exact versions, and a minimum release age. Keep dependency changes narrow and let Bun update `bun.lock`.
