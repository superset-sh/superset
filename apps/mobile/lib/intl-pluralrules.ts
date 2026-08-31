/**
 * `Intl.PluralRules` for Hermes, which does not ship it.
 *
 * Hermes gives iOS most of Intl — `Collator`, `NumberFormat` and
 * `DateTimeFormat` are all there — but `PluralRules` is missing. Lingui
 * compiles every plural message to a runtime `new Intl.PluralRules(...)`, so
 * without this each one throws "undefined cannot be used as a constructor" as
 * it renders. There is no error boundary above these screens, so the throw
 * takes the whole tree down rather than degrading to English or to the raw
 * message.
 *
 * That is 23 messages on mobile surfaces today — search results, the commits
 * list, hidden-line counts in a diff, the files-changed summary, pull request
 * headlines and file counts, reasoning durations, test result counts.
 *
 * Imported for its side effects, before anything renders. `polyfill` installs
 * only when the runtime is actually missing the API, so a future Hermes that
 * grows one keeps its own.
 *
 * One data file per base language: plural categories do not vary by region, so
 * `zh` serves zh-CN and zh-TW, and `pt` serves pt-BR. Keep in step with
 * `SUPPORTED_LOCALES` in `packages/i18n/src/locales.ts`.
 *
 * The `.js` on each specifier is load-bearing: the package's `exports` map
 * publishes `./polyfill.js` and `./locale-data/*`, so the extensionless form
 * resolves in Metro but not in TypeScript.
 */
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
