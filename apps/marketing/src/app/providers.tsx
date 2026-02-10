"use client";

import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { getOutlit } from "@/lib/outlit";

function OutlitWrapper({ children }: { children: React.ReactNode }) {
	const client = getOutlit();

	if (!client) {
		return <>{children}</>;
	}

	return (
		<OutlitBrowserProvider client={client}>{children}</OutlitBrowserProvider>
	);
}

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<OutlitWrapper>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					forcedTheme="dark"
					storageKey={THEME_STORAGE_KEY}
					disableTransitionOnChange
				>
					{children}
				</ThemeProvider>
			</OutlitWrapper>
		</PostHogProvider>
	);
}
