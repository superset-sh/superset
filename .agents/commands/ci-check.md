---
description: Run lint:fix, typecheck, test, check:i18n, and sherif to validate the project before pushing
allowed-tools: Bash
---

Run all CI checks locally to validate the project.

## Checks

Run the two fixers first, since they rewrite files the other checks read:

1. `bun run lint:fix` — Biome formatting + linting (auto-fixes)
2. `bunx sherif --fix` — Monorepo dependency linting (auto-fixes)

Then run these three **in parallel** and report all results:

3. `bun run typecheck` — TypeScript type checking across all packages
4. `bun test` — Run all tests
5. `bun run check:i18n` — Regenerates the translation catalogs and fails on missing or stale translations

## Output

After all commands complete, print a summary table:

| Check | Status |
|-------|--------|
| lint:fix | pass/fail |
| typecheck | pass/fail |
| test | pass/fail |
| check:i18n | pass/fail |
| sherif | pass/fail |

If any check fails, show the relevant error output.

## Fix Warnings

After the initial run, if any check produced **warnings** (not just errors), fix them manually since warnings still fail CI. Re-run the failing check(s) to confirm they pass cleanly with zero warnings.

If `check:i18n` lists missing translations, write them into every `packages/i18n/locales/<locale>/messages.po` it names and re-run. Commit the catalogs it regenerated; CI fails if they differ from what was committed.

$ARGUMENTS
