# streams Frontend Package Guidelines

## Scope
Reserved package shell. It currently contains only `package.json` and no source tree.

## Source Examples
- `apps/streams/package.json` is the only current file.

## Local Patterns
- Before adding code, decide whether this should be a Next app, service, or package and add the matching scripts/config.
- Follow monorepo Bun/Turbo conventions and create package-specific specs once ownership is real.

## Avoid
- Do not infer frontend architecture from the empty package shell.
- Do not add unused dependencies or generated scaffolding without a concrete product requirement.

## Validation
- No package validation exists yet; add scripts with the first real implementation.
