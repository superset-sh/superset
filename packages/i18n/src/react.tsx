"use client";

import { I18nProvider as LinguiI18nProvider } from "@lingui/react";
import { type ReactNode, useEffect, useState } from "react";
import { i18n, inferLocale, initI18n } from "./index";
import type { SupportedLocale } from "./locales";

// Activate at module scope so the first render is already localized;
// activation notifies Lingui subscribers, so it must not run inside a render
// pass (React can repeat or abandon renders).
initI18n(inferLocale());

export function I18nProvider({
	children,
	locale,
}: {
	children: ReactNode;
	// Explicit locale (persisted setting, device locale). Omitted: the
	// module-scope inference above stands.
	locale?: SupportedLocale;
}) {
	// Remount the subtree when the locale changes: Trans/useLingui consumers
	// re-render via Lingui's own subscription, but plain formatter calls
	// (@superset/i18n/format) read the locale imperatively and only refresh on
	// a re-render. Language switches are rare; a remount keeps every call site
	// a plain function call instead of a hook.
	const [activeLocale, setActiveLocale] = useState(() => i18n.locale);
	useEffect(() => i18n.on("change", () => setActiveLocale(i18n.locale)), []);
	useEffect(() => {
		// No explicit locale means "Auto", which is a real choice and not an
		// absence of one: fall back to inference so switching from a pinned
		// language back to Auto re-activates instead of leaving the old locale
		// active until the next restart.
		const next = locale ?? inferLocale();
		if (i18n.locale !== next) {
			initI18n(next);
		}
		// Keep the document's language attribute truthful: CSS text-transform
		// and screen readers key off it, and a stale "en" breaks locale-aware
		// casing — Turkish uppercases i to İ, not I.
		if (typeof document !== "undefined") {
			document.documentElement.lang = next;
		}
	}, [locale]);
	return (
		<LinguiI18nProvider key={activeLocale} i18n={i18n}>
			{children}
		</LinguiI18nProvider>
	);
}
