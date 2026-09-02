"use client";

import { I18nProvider as LinguiI18nProvider } from "@lingui/react";
import { type ReactNode, useEffect, useState } from "react";
import { i18n, inferLocale, initI18n } from "./index";
import {
	LOCALE_COOKIE,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "./locales";

// Activate the DEFAULT locale at module scope — deterministically the same
// on the server and on the client's first render. Inferring the real locale
// here localized the client's first render while the server had rendered
// English, which threw a hydration mismatch on every translated client
// string for every non-English user ("Search docs..." vs "Tìm trong tài
// liệu..."). The provider switches to the inferred or chosen locale after
// mount instead; the brief default-language flash on client chrome is the
// price of hydration correctness, and server-component content (marketing
// pages) is localized in the HTML itself and never hydrates.
initI18n();

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
	/**
	 * When provided, called with the chosen locale instead of the default
	 * cookie-and-reload behavior — for apps whose locale lives in the URL,
	 * where applying a choice is a navigation.
	 */
	onSelect?: (locale: SupportedLocale) => void;
	/**
	 * Server-resolved effective locale, when the caller knows it. Client
	 * components server-render through the non-RSC module instance, whose
	 * i18n singleton has not been activated for the request — without this
	 * the select's initial value names the default language, not the one on
	 * screen.
	 */
	locale?: SupportedLocale;
	className?: string;
}

/**
 * Language switcher following the pattern of the best localized sites
 * (Stripe, Mozilla): a native select, options in their own language — a
 * reader lost in the wrong language must recognize their own — each carrying
 * its lang attribute so screen readers pronounce it correctly, no flags
 * (flags name countries, not languages).
 *
 * The trigger shows the language actually in effect, never a meta-label like
 * "Auto": before any choice it names the auto-detected language, which is
 * what the reader sees around them. Choosing a language pins it in
 * LOCALE_COOKIE and reloads — server-resolved apps re-render in the new
 * language, and inferLocale honors the cookie everywhere else. Strings
 * arrive as props because each app extracts its own catalog entries.
 */
export function LanguageSwitcher({
	label,
	locale,
	onSelect,
	className,
}: LanguageSwitcherProps) {
	// The effective locale: starts at the module's current value (the server
	// pass rendered with the request's locale on server-resolved apps) and
	// follows activation, so the trigger always names the language on screen.
	const [value, setValue] = useState<SupportedLocale>(
		() => locale ?? (i18n.locale as SupportedLocale),
	);
	useEffect(() => {
		setValue(i18n.locale as SupportedLocale);
		return i18n.on("change", () => setValue(i18n.locale as SupportedLocale));
	}, []);

	return (
		<select
			aria-label={label}
			className={className}
			value={value}
			onChange={(event) => {
				const next = event.target.value as SupportedLocale;
				if (onSelect) {
					onSelect(next);
					return;
				}
				// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is still not available in all supported browsers, and the page reloads immediately after this write.
				document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
				// A full reload is deliberate: server-rendered apps must
				// re-resolve the locale, and the whole page changes language.
				window.location.reload();
			}}
		>
			{SUPPORTED_LOCALES.map((locale) => (
				<option key={locale} value={locale} lang={locale}>
					{LOCALE_LABELS[locale]}
				</option>
			))}
		</select>
	);
}
