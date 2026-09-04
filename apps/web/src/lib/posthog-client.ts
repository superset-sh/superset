import { inferLocaleWithSource } from "@superset/i18n";
import posthog from "posthog-js";

/**
 * Super properties every web event carries. Registered at init, and again
 * after posthog.reset() on sign-out, which clears them along with the person.
 */
export function registerBaseProperties(): void {
	const { locale, source } = inferLocaleWithSource();
	posthog.register({
		app_name: "web",
		domain: window.location.hostname,
		app_locale: locale,
		app_locale_source: source,
	});
}
