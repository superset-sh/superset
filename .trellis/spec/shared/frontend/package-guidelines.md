# @superset/shared Frontend Package Guidelines

## Scope
Runtime-neutral constants, parsing utilities, terminal protocol helpers, agent definitions, billing helpers, and workspace-launch logic shared across apps/packages.

## Source Examples
- `packages/shared/src/constants.ts` owns cross-app constants and feature flags.
- `packages/shared/src/agent-*.ts` files own agent command, launch, catalog, identity, and settings helpers.
- `packages/shared/src/terminal-link-parsing/` and scanner files own terminal parsing logic.
- `packages/shared/src/workspace-launch/` owns branch/name/slug helpers.
- `packages/shared/package.json` exports each public subpath explicitly.

## Local Patterns
- Keep shared utilities runtime-neutral and side-effect light.
- Add or update explicit `package.json` exports when a utility becomes public.
- Add tests next to parsers and launch helpers; this package already has broad `*.test.ts` coverage.
- Centralize constants here when 2+ packages need the same value.

## Avoid
- Do not import app code, Electron, or database clients into shared utilities.
- Do not create a helper here for a one-off app concern.
- Do not change exported constants without searching all references first.

## Validation
- `bun --cwd packages/shared test`
- `bun --cwd packages/shared typecheck`
