"use client";

import type { Messages } from "@lingui/core";
import type { SupportedLocale } from "@superset/i18n";
import { I18nProvider } from "@superset/i18n/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { LazyMotion } from "framer-motion";
import { ThemeProvider } from "next-themes";

// Components use `m.*` (not `motion.*`) so the framer-motion feature bundle
// loads in this async chunk instead of the critical-path JS
const loadMotionFeatures = () =>
	import("./motion-features").then((mod) => mod.default);

export function Providers({
	children,
	locale,
	messages,
}: {
	children: React.ReactNode;
	// Server-resolved locale, so client components render the same language
	// the server did instead of re-inferring from the browser.
	locale?: SupportedLocale;
	messages?: Messages;
}) {
	return (
		<I18nProvider locale={locale} initialMessages={messages}>
			<LazyMotion features={loadMotionFeatures}>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					forcedTheme="dark"
					storageKey={THEME_STORAGE_KEY}
					disableTransitionOnChange
				>
					{children}
				</ThemeProvider>
			</LazyMotion>
		</I18nProvider>
	);
}
