# @superset/i18n

Shared internationalization for every surface: one Lingui catalog set, one
shared `i18n` instance, one locale list. Strategy and phasing:
`plans/20260826-i18n-strategy.md`.

## Usage

- **React (desktop renderer, web, marketing, docs, mobile)**: wrap the app in
  `I18nProvider` from `@superset/i18n/react`, then use macros:
  `import { Trans, useLingui } from "@lingui/react/macro"`. Give every message
  an explicit ID with the source text as default:
  `<Trans id="settings.appearance.title">Appearance</Trans>`.
- **Non-React (Electron main, scripts)**: `import { i18n, initI18n } from "@superset/i18n"`
  and call `i18n._({ id, message })`. The extractor picks these descriptors up
  too, so main-process strings live in the same catalog with no build-plugin
  changes; at runtime they fall back to `message` if a translation is missing.

## Catalog workflow

- `bun run extract` regenerates `locales/*/messages.po` from source (also runs
  on `pretypecheck`, so `turbo typecheck` keeps catalogs fresh).
- `bun run build` compiles `locales/*/messages.po` into the `locales/*/messages.ts`
  the apps import; `--strict` fails on missing translations. The compiled files
  are **gitignored and generated**, and every consumer builds them itself so no
  path depends on install scripts: desktop runs it in `predev`, `pretypecheck`
  and `precompile:app` (the release workflow calls `compile:app` directly after
  an `--ignore-scripts` install); the Next apps in `prebuild` (`vercel build`
  runs `bun run build`); mobile in `predev`, `preios`, `preandroid` and the
  `eas-build-post-install` hook; the CLI in `prebuild` and `prebuild:dist`
  (`build-cli.yml` installs Linux deps with `--ignore-scripts`). Root `postinstall` also builds them, turbo's
  `build`/`typecheck`/`test`/`dev` tasks depend on `@superset/i18n#build`, and
  the turbo cache restores them. Only the `.po` files are committed. (A
  committed `messages.ts` is one line per locale, so any two PRs that each
  added a string conflicted on all seventeen.)
- CI runs `bun run check` (extract + strict compile + stale-translation audit +
  clean `git diff`) in the lint job, so drift between source and committed
  catalogs fails CI.

## ID conventions

`area.subarea.name` in camelCase segments, e.g. `settings.appearance.title`,
`tray.openApp`. IDs are stable: editing English copy must not change the ID.

## Editing English copy under a stable ID

Because IDs are stable, Lingui treats the text as loosely coupled to them, and
editing English in source does **not** by itself change what ships. Two things
go wrong, and both are covered:

1. **The source catalog ignores the edit.** `msgstr` in `locales/en` is what
   renders, and plain `lingui extract` only fills in *new* IDs, so an edit to an
   existing message would leave the old English shipping. `extract` therefore
   runs with `--overwrite`, which rewrites the source locale from source code
   every time. Corollary: never hand-edit `locales/en/messages.po` for wording.
   English lives in the `message:` / `<Trans>` body, and the catalog is derived.
2. **The translations keep the old wording.** Nothing invalidates ja/zh when the
   English moves, and `compile --strict` still passes because nothing is
   missing. `scripts/check-stale-translations.ts` compares the branch against
   its merge base and fails when a message's English changed and a translation
   did not. It prints each stale message and what to do.

If an edit genuinely does not invalidate a translation (fixing an English typo,
rewording a sentence the translation already renders correctly), add the message
to `locales/en-only-changes.txt`. Exemptions are keyed to the exact English text
they were granted for, so the next edit to that message is checked again.

## New strings translate themselves on the PR

Adding an English string leaves every enabled locale with an empty entry, which
`compile --strict` refuses. The `Translate Catalogs` workflow closes that gap on
the PR: it extracts, fills the missing entries with Claude — anchored to each
catalog's own existing translations for register and terminology — validates
placeholder, tag, and ICU integrity (rejected fills stay empty so the strict
gate fails loudly), and pushes the fills back to the branch. To run it locally
instead: `bun run --cwd packages/i18n translate` with `ANTHROPIC_API_KEY` set.
Machine fills are a floor, not a ceiling — reword them freely in the same PR.
