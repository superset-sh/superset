"use client";

import { I18nProvider as LinguiI18nProvider } from "@lingui/react";
import { type ReactNode, useEffect, useState } from "react";
import { i18n, inferLocale, initI18n } from "./index";
import {
	isSupportedLocale,
	LOCALE_COOKIE,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "./locales";

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

interface LanguageSwitcherProps {
	/** Accessible name for the control, localized by the calling app. */
	label: string;
	/** Label for the follow-the-browser entry, localized by the calling app. */
	autoLabel: string;
	className?: string;
}

/**
 * Language switcher following the pattern of the best localized sites
 * (Stripe, Mozilla): a native select, options in their own language — a
 * reader lost in the wrong language must recognize their own — each carrying
 * its lang attribute so screen readers pronounce it correctly, no flags
 * (flags name countries, not languages).
 *
 * The choice persists in LOCALE_COOKIE and applies with a full reload:
 * server-resolved apps re-render in the new language, and inferLocale honors
 * the cookie everywhere else. "Auto" clears the cookie and returns to
 * browser preferences. Strings arrive as props because each app extracts its
 * own catalog entries for them.
 */
export function LanguageSwitcher({
	label,
	autoLabel,
	className,
}: LanguageSwitcherProps) {
	// Starts at "auto" on both server and first client render, then reads the
	// cookie after mount — keeps server and client markup identical.
	const [value, setValue] = useState("auto");
	useEffect(() => {
		const match = document.cookie.match(
			new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
		);
		const chosen = match?.[1];
		if (chosen && isSupportedLocale(chosen)) setValue(chosen);
	}, []);

	return (
		<select
			aria-label={label}
			className={className}
			value={value}
			onChange={(event) => {
				const next = event.target.value;
				// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is still not available in all supported browsers, and the page reloads immediately after this write.
				document.cookie =
					next === "auto"
						? `${LOCALE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
						: `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
				// A full reload is deliberate: server-rendered apps must
				// re-resolve the locale, and the whole page changes language.
				window.location.reload();
			}}
		>
			<option value="auto">{autoLabel}</option>
			{SUPPORTED_LOCALES.map((locale) => (
				<option key={locale} value={locale} lang={locale}>
					{LOCALE_LABELS[locale]}
				</option>
			))}
		</select>
	);
}
