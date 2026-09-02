import { setI18n } from "@lingui/react/server";
import { i18n, initI18n, loadLocale } from "./index";
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
 * Call this from every route entry that renders server components — each
 * `page.tsx`, plus `not-found.tsx` and any other entry (opengraph-image
 * routes, global-error). A root layout is NOT enough: a client-side navigation
 * re-renders only the segments below the shared layout, so the layout body
 * never runs and the slot stays empty for the whole page. `template.tsx` is
 * pruned the same way. Lingui's own error says it exactly: "call `setI18n` in
 * the root of your page".
 *
 * This is deliberately synchronous. Seeding the slot has to happen during the
 * render pass that reads it, so an async version silently renders before
 * `setI18n` lands and every server `<Trans>` throws. English is bundled and
 * activates synchronously, which is what makes that possible; a non-default
 * locale still needs `preloadServerLocale` first.
 *
 * `packages/i18n/test/rsc-seeding.test.ts` enforces this for the marketing app.
 */
export function initServerI18n(locale?: SupportedLocale): void {
	initI18n(locale);
	setI18n(i18n);
}

/**
 * Loads a non-default catalog so a following `initServerI18n(locale)` activates
 * it synchronously. Await this in a layout or route before rendering when the
 * request resolves to a locale other than English.
 */
export async function preloadServerLocale(
	locale: SupportedLocale,
): Promise<void> {
	await loadLocale(locale);
}
