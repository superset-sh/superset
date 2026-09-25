# @superset/i18n

Shared internationalization for every surface: one Lingui catalog set, one
client `i18n` instance, fixed server instances per locale, one locale list. Strategy and phasing:
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

## Server rendering

Follow [Lingui's Next.js App Router guide](https://lingui.dev/tutorials/react-rsc)
and its [locale-instance example](https://github.com/lingui/js-lingui/blob/main/examples/nextjs-swc/src/appRouterI18n.ts).
`@superset/i18n/server` keeps a separate `setupI18n` instance for each locale.
Unlike the example's eager catalog loading, catalogs here load on demand;
`await preloadServerLocale(locale)` must complete before selecting an instance.
Never call `activate()` or `load()` on a cached server instance.

- Every RSC page and layout calls `initServerI18n(locale)` after preloading.
  This binds the instance to Lingui's request-local React cache. Layout-only
  initialization misses client navigation.
- Server components use `Trans`/`useLingui`. Metadata and plain utilities use
  `getI18nInstance(locale)` or the instance returned by `initServerI18n`.
  Never import the client singleton for server translations.
- Route handlers pass the selected instance explicitly; they do not have an
  RSC render cache. A caller without a locale contract uses the English default.
- Formatters receive `i18n.locale` explicitly, including in client components
  rendered on the server. Their implicit default is the client singleton.
- Pass the locale and catalog (not the non-serializable instance) to the client
  provider. Locale changes navigate to the localized URL.

Marketing's `app/i18n-server.ts` resolves the URL locale and handles preloading
and binding. Its bare URLs remain English; it does not infer a request language
from another visitor, browser preferences, or cookies.

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

## Client activation and formatting

`initI18nAsync(locale)` loads before activating and ignores completions from older
requests. Keep locale changes on this shared path; a delayed import must not
replace a newer selection. Native roots use `deferUntilReady` to withhold the
initial application tree until its catalog is ready. Failed imports retain the
last active locale (English on first launch) and report the failure.

Do not key the provider or application subtree by locale. Lingui updates its
context without resetting drafts, focus, navigation, or component state. React
formatting consumers use `useFormat()` from `@superset/i18n/react`; plain helpers
receive an explicit locale. A server snapshot owns its own instance and must not
activate the browser singleton. Depend on the reactive `t`/`_` function when
memoizing translated values, and translate descriptors during rendering rather
than evaluating them in module constants.

Web, admin, and docs resolve a supported cookie preference first, then the
weighted `Accept-Language` header, then English. Their root HTML, metadata,
server components, and client provider share that locale and catalog. The
shared language switcher writes the preference and reloads server content.
Marketing keeps its explicit URL-language contract.

## Native surfaces

The Expo config derives iOS supported languages from `SUPPORTED_LOCALES`.
`apps/mobile/locales/` supplies permission descriptions. The composer and
attachments-sheet modules package their own `.lproj` resources; composer
attachment counts use native plural resources. These strings are outside
Lingui's JavaScript extractor and have separate resource-coverage tests.
Changing native resources requires a new native build, not only a JS update.
Desktop preference changes broadcast through the settings subscription so all
windows, the native menu, and the tray follow the same activation.

## Actions and Resend emails

Localized actions accept and validate an explicit locale for responses displayed
in the app. Resend email subjects, bodies, and formatting remain English,
independent of the sender's or recipient's app language. Email templates and
background email jobs are outside Lingui extraction and enforcement.

## Regression coverage

The test suites cover suspended concurrent RSC requests, rapid and failed
catalog loads, cold provider readiness, state/focus retention, reactive
formatting, locale precedence, and all native resources.
The hardcoded-string ratchet covers visible/accessibility props and toast/alert literals as well as JSX
text in enforced directories, with explicit exceptions for technical literals
and glossary terms. A complete catalog is not evidence that every un-enforced
screen or externally published template has been audited.
