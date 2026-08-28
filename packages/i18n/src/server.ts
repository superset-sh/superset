import { setI18n } from "@lingui/react/server";
import { i18n, initI18n } from "./index";
import type { SupportedLocale } from "./locales";

export { i18n };

/**
 * Activates i18n for a React Server Components render.
 *
 * Server components resolve `@lingui/react` through the `react-server` export
 * condition, where `<Trans>` and `useLingui()` read the active instance from a
 * React.cache slot rather than React context — there is no context in RSC, and
 * the lookup throws if the slot was never seeded. Next also gives the RSC
 * module layer its own copy of the shared singleton, so the client-side
 * `I18nProvider` never activates it.
 *
 * Call this once from a root layout: it covers every server component rendered
 * beneath. Entry points that render *outside* the root layout (opengraph-image
 * routes, global-error) need their own call.
 */
export function initServerI18n(locale?: SupportedLocale): void {
	initI18n(locale);
	setI18n(i18n);
}
