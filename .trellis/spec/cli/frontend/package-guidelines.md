# @superset/cli Frontend Package Guidelines

## Scope
Bun-distributed CLI commands, Ink UI, auth resolution, API upload helpers, and packaging scripts.

## Source Examples
- `packages/cli/src/commands/middleware.ts` wires command middleware.
- `packages/cli/src/lib/command.ts` defines command helpers.
- `packages/cli/src/lib/auth.ts`, `resolve-auth.ts`, and tests own auth resolution.
- `packages/cli/CLI_SPEC_CURRENT.md` and `CLI_SPEC_TARGET.md` describe current and target CLI behavior.

## Local Patterns
- Build commands on `@superset/cli-framework`; keep parsing, auth, and side effects separated.
- Use `SUPERSET_API_URL` from the dev script and `src/lib/env.ts`; do not hard-code API URLs.
- Keep upload/auth/network helpers in `src/lib` with tests before adding command UI around them.
- Use Bun build scripts already present in `package.json` for distributable binaries.

## Avoid
- Do not bypass the command framework for new commands.
- Do not mix interactive prompt rendering with API client internals.
- Do not add another CLI package manager or lockfile.

## Validation
- `bun --cwd packages/cli typecheck`
- Run targeted `bun test` files for changed `src/lib/*.test.ts` files.
