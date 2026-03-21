---
name: ci-check
description: Run lint:fix, typecheck, test, and sherif to validate the project before pushing
---

# CI Check

Run all CI checks locally to validate the project.

## Checks

Run the file-mutating fixers **sequentially** (they both write to the working tree and can clash), then run the read-only checks **in parallel**:

### Sequential (mutating)
1. `bun run lint:fix` — Biome formatting + linting (auto-fixes)
2. `bunx sherif --fix` — Monorepo dependency linting (auto-fixes)

### Parallel (read-only)
3. `bun run typecheck` — TypeScript type checking across all packages
4. `bun test` — Run all tests

## Output

After all commands complete, print a summary table:

| Check | Status |
|-------|--------|
| lint:fix | pass/fail |
| typecheck | pass/fail |
| test | pass/fail |
| sherif | pass/fail |

If any check fails, show the relevant error output.

## Fix Warnings

After the initial run, if any check produced **warnings** (not just errors), fix them manually since warnings still fail CI. Re-run the failing check(s) to confirm they pass cleanly with zero warnings.
