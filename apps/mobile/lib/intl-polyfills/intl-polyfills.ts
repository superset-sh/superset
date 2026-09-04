/**
 * The `Intl` APIs Hermes does not ship, per Lingui's React Native guidance.
 *
 * Measured on Hermes / iOS 26.5 — `Collator`, `NumberFormat`, `DateTimeFormat`
 * and `getCanonicalLocales` are present; `Locale`, `PluralRules`,
 * `RelativeTimeFormat`, `ListFormat`, `Segmenter` and `DisplayNames` are not.
 * Lingui compiles every plural message to a runtime `new Intl.PluralRules(...)`,
 * so without these each one throws "undefined cannot be used as a constructor"
 * as it renders. Nothing in the mobile tree is an error boundary, so the throw
 * takes the screen down rather than degrading to the raw message.
 *
 * `Locale` is imported first and is not optional: `@formatjs/intl-pluralrules`
 * depends on `@formatjs/intl-localematcher`, whose best-fit path calls
 * `new Intl.Locale(tag).maximize()`. That path is only reached for a tag
 * carrying a region or script subtag, so polyfilling plurals alone left en, ru,
 * cs and ja working while zh-CN, zh-TW and pt-BR still threw — a failure that
 * is invisible to an English speaker and total for a Chinese one.
 *
 * Imported for side effects, before anything renders. Each `polyfill` entry
 * installs only when the runtime is actually missing the API, so a future
 * Hermes that grows one keeps its own.
 *
 * One plural data file per base language: plural categories do not vary by
 * region, so `zh` serves zh-CN and zh-TW, and `pt` serves pt-BR. Keep in step
 * with `SUPPORTED_LOCALES` in `packages/i18n/src/locales.ts`.
 *
 * The `.js` on each specifier is load-bearing: the packages' `exports` maps
 * publish `./polyfill.js` and `./locale-data/*`, so the extensionless form
 * resolves in Metro but not in TypeScript.
 */
import "@formatjs/intl-locale/polyfill.js";

import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/cs.js";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";
import "@formatjs/intl-pluralrules/locale-data/fr.js";
import "@formatjs/intl-pluralrules/locale-data/id.js";
import "@formatjs/intl-pluralrules/locale-data/it.js";
import "@formatjs/intl-pluralrules/locale-data/ja.js";
import "@formatjs/intl-pluralrules/locale-data/ko.js";
import "@formatjs/intl-pluralrules/locale-data/nl.js";
import "@formatjs/intl-pluralrules/locale-data/pl.js";
import "@formatjs/intl-pluralrules/locale-data/pt.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import "@formatjs/intl-pluralrules/locale-data/tr.js";
import "@formatjs/intl-pluralrules/locale-data/vi.js";
import "@formatjs/intl-pluralrules/locale-data/zh.js";
