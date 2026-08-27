"use client";

import { I18nProvider as LinguiI18nProvider } from "@lingui/react";
import { type ReactNode, useEffect } from "react";
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
	useEffect(() => {
		if (locale && i18n.locale !== locale) {
			initI18n(locale);
		}
	}, [locale]);
	return <LinguiI18nProvider i18n={i18n}>{children}</LinguiI18nProvider>;
}
