# @superset/i18n

Shared internationalization for every surface: one Lingui catalog set, one
shared `i18n` instance, one locale list. Strategy and phasing:
`plans/20260826-i18n-strategy.md`.

## Usage

- **React (desktop renderer, web, marketing, docs, mobile)**: wrap the app in
  `I18nProvider` from `@superset/i18n/react`, then use macros:
  `import { Trans, useLingui } from "@lingui/react/macro"`, e.g.
  `<Trans>Appearance</Trans>` or `t({ message: "Appearance" })`.
- **Non-React (Electron main, scripts)**: `import { i18n } from "@superset/i18n"`
  and `import { msg } from "@lingui/core/macro"`, then `i18n._(msg({ message: "…" }))`.
  The desktop main build runs the macro through `linguiMacroPlugin` in
  `apps/desktop/vite/helpers.ts`; every other surface runs it in its bundler.

The English text is the message id, so identical text is one entry everywhere
it appears. When the same English means different things, add a `context` so it
translates separately: `<Trans context="menu">View</Trans>` (the menu bar) versus
`<Trans>View</Trans>` (a button).

## After touching a string

Run `bun run check:i18n` from the repo root and commit what it regenerates
(`locales/*/messages.po` and the compiled `locales/*/messages.ts`). It takes
about seven seconds and, like a linter, lists what is wrong and exits non-zero
when any enabled locale is missing a message. Editing English creates a new
entry, so it shows up here too; if the edit was cosmetic, the old translations
are still in `git diff` on the catalogs to copy from.

Write the translations into each `locales/<locale>/messages.po` yourself. Keep
`{placeholders}` and `<0>…</0>` tag markers intact, match the terminology the
catalog already uses, and expand ICU plurals to the branches the language needs:
Russian, Polish, and Czech take one/few/many/other; Japanese, Chinese, Korean,
Indonesian, Vietnamese, and Turkish have no plural inflection, so every branch
carries the same text.

CI runs the same command on a clean checkout and additionally fails if the
regenerated catalogs differ from what was committed. Nothing on CI fills
translations, so a PR with untranslated strings stays red until its author
fills them. Never hand-edit `locales/en/messages.po`; it is derived from source.
