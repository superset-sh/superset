# @superset/cli-framework Frontend Package Guidelines

## Scope
CLI user-facing output, help text, and developer command ergonomics produced by the framework.

## Source Examples
- `packages/cli-framework/src/help.ts` renders command help.
- `packages/cli-framework/src/output.ts` centralizes terminal output helpers.
- `packages/cli-framework/src/bin.ts` exposes the framework binary.

## Local Patterns
- Keep help/output rendering deterministic and testable.
- Keep CLI UX concerns separate from parser data structures where possible.
- Use the framework bin only for build/dev workflows; product commands live in `packages/cli`.

## Avoid
- Do not write product-specific copy in the framework.
- Do not introduce terminal UI libraries here unless all consumers need them.

## Validation
- `bun --cwd packages/cli-framework typecheck`
