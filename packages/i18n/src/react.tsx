"use client";

import { I18nProvider as LinguiI18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { i18n, inferLocale, initI18n } from "./index";
import type { SupportedLocale } from "./locales";

export function I18nProvider({
	children,
	locale,
}: {
	children: ReactNode;
	// Explicit locale (persisted setting, device locale). Omitted: inferred
	// from the runtime's language preferences on first load.
	locale?: SupportedLocale;
}) {
	const resolved = locale ?? inferLocale();
	if (i18n.locale !== resolved) {
		initI18n(resolved);
	}
	return <LinguiI18nProvider i18n={i18n}>{children}</LinguiI18nProvider>;
}
