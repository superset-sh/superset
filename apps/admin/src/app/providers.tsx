"use client";

import { I18nProvider } from "@superset/i18n/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<I18nProvider>
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
