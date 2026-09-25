"use client";

import { type Messages, setupI18n } from "@lingui/core";
import { I18nProvider as LinguiI18nProvider, useLingui } from "@lingui/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { i18n, inferLocale, initI18n, initI18nAsync } from "./index";
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
// mount instead unless the server supplies a locale and its catalog. That
// snapshot translates the initial HTML and hydration with a request-local
// instance, without activating a shared singleton during concurrent SSR.
initI18n();

export function I18nProvider({
	children,
	locale,
	initialMessages,
	deferUntilReady = false,
}: {
	children: ReactNode;
	// Explicit locale (persisted setting, device locale). Omitted: the
	// browser preference is resolved after mount.
	locale?: SupportedLocale;
	/** Server-resolved catalog for translated SSR and matching hydration. */
	initialMessages?: Messages;
	/** Native startup only: keep children unmounted until the initial catalog is ready. */
	deferUntilReady?: boolean;
}) {
	const [ready, setReady] = useState(!deferUntilReady || !!initialMessages);
	const renderI18n = useMemo(
		() =>
			locale && initialMessages
				? setupI18n({ locale, messages: { [locale]: initialMessages } })
				: i18n,
		[locale, initialMessages],
	);
	useEffect(() => {
		const updateDocumentLanguage = () => {
			if (typeof document !== "undefined") {
				document.documentElement.lang = renderI18n.locale;
			}
		};
		updateDocumentLanguage();
		return renderI18n.on("change", updateDocumentLanguage);
	}, [renderI18n]);
	useEffect(() => {
		// Server snapshots are already loaded and isolated from the client singleton.
		if (initialMessages) return;
		let disposed = false;
		void initI18nAsync(locale ?? inferLocale())
			.catch((error: unknown) =>
				console.error("Failed to activate locale", error),
			)
			.finally(() => {
				if (!disposed) setReady(true);
			});
		return () => {
			disposed = true;
		};
	}, [locale, initialMessages]);
	if (!ready) return null;
	return <LinguiI18nProvider i18n={renderI18n}>{children}</LinguiI18nProvider>;
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
	 * Called with the chosen and the outgoing locale before the choice is
	 * applied, so apps can record the switch ahead of the reload or
	 * navigation that follows.
	 */
	onChange?: (next: SupportedLocale, current: SupportedLocale) => void;
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
	onChange,
	className,
}: LanguageSwitcherProps) {
	const { i18n: contextI18n } = useLingui();
	const value = locale ?? (contextI18n.locale as SupportedLocale);

	return (
		<select
			aria-label={label}
			className={className}
			value={value}
			onChange={(event) => {
				const next = event.target.value as SupportedLocale;
				onChange?.(next, value);
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

export { useFormat } from "./hooks/useFormat";
