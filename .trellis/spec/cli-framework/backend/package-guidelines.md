# @superset/cli-framework Backend Package Guidelines

## Scope
Runtime-neutral command parser, router, middleware, errors, build/dev helpers, and command execution core.

## Source Examples
- `packages/cli-framework/src/parser.ts` parses argv into command options.
- `packages/cli-framework/src/router.ts` and `runner.ts` dispatch commands.
- `packages/cli-framework/src/errors.ts` owns framework error types.
- `packages/cli-framework/src/build.ts` and `dev.ts` power package CLI scripts.

## Local Patterns
- Keep this package dependency-light and framework-owned; product CLI logic belongs in `packages/cli`.
- Model command definitions with typed options from `option.ts` and `command.ts`.
- Return structured errors from parsing/running so consuming CLIs can render them.

## Avoid
- Do not import Superset app state or API clients here.
- Do not make parser behavior depend on process-global mutable state.

## Validation
- `bun --cwd packages/cli-framework typecheck`
