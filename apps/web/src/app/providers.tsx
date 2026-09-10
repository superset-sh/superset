"use client";
import type { Messages } from "@lingui/core";
import type { SupportedLocale } from "@superset/i18n/locales";

import { I18nProvider } from "@superset/i18n/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({
	children,
	locale,
	initialMessages,
}: {
	children: React.ReactNode;
	locale: SupportedLocale;
	initialMessages: Messages;
}) {
	return (
		<PostHogProvider client={posthog}>
			<I18nProvider locale={locale} initialMessages={initialMessages}>
				<TRPCReactProvider>
					<ThemeProvider
						attribute="class"
						defaultTheme="dark"
						forcedTheme="dark"
						storageKey={THEME_STORAGE_KEY}
						disableTransitionOnChange
					>
						<PostHogUserIdentifier />
						{children}
						<ReactQueryDevtools initialIsOpen={false} />
					</ThemeProvider>
				</TRPCReactProvider>
			</I18nProvider>
		</PostHogProvider>
	);
}
