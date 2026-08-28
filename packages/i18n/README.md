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
- `bun run compile` emits the committed `locales/*/messages.ts` the apps
  import; `--strict` fails on missing translations.
- CI runs `bun run check` (extract + strict compile + clean `git diff`) in the
  lint job, so drift between source and committed catalogs fails CI.

## ID conventions

`area.subarea.name` in camelCase segments, e.g. `settings.appearance.title`,
`tray.openApp`. IDs are stable: editing English copy must not change the ID.
