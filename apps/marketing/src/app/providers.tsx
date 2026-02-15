"use client";

import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { env } from "@/env";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<OutlitBrowserProvider
				publicKey={env.NEXT_PUBLIC_OUTLIT_KEY}
				trackPageviews
				trackForms
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					forcedTheme="dark"
					storageKey={THEME_STORAGE_KEY}
					disableTransitionOnChange
				>
					{children}
				</ThemeProvider>
			</OutlitBrowserProvider>
		</PostHogProvider>
	);
}
