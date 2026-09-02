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

IDs are `area.subarea.name` in camelCase segments, e.g. `settings.appearance.title`,
`tray.openApp`. They are stable: editing English copy must not change the ID.

## After touching a string

Run `bun run check:i18n` from the repo root and commit what it regenerates
(`locales/*/messages.po` and the compiled `locales/*/messages.ts`). It takes
about seven seconds and, like a linter, lists what is wrong and exits non-zero
on either of:

- **A missing translation.** Every enabled locale must have every message; the
  output lists each missing id with its English source, per locale. Write the
  translations into each `locales/<locale>/messages.po` yourself. Keep
  `{placeholders}` and `<0>…</0>` tag markers intact, match the terminology the
  catalog already uses, and expand ICU plurals to the branches the language
  needs: Russian, Polish, and Czech take one/few/many/other; Japanese, Chinese,
  Korean, Indonesian, Vietnamese, and Turkish have no plural inflection,
  so every branch carries the same text.
- **A stale translation.** IDs are stable, so Lingui never notices when the
  English under one changes; `scripts/check-stale-translations.ts` compares the
  branch to its merge base and fails when English moved and a translation did
  not. Update the translation, or if the edit does not change meaning (a typo
  fix), add the id to `locales/en-only-changes.txt`. Exemptions are keyed to the
  exact new English text, so the next edit is checked again.
CI runs the same command on a clean checkout and additionally fails if the
regenerated catalogs differ from what was committed. Nothing on CI fills
translations, so a PR with untranslated strings stays red until its author
fills them. Never hand-edit `locales/en/messages.po`; English lives in the
`message:` / `<Trans>` body and the catalog is derived.
