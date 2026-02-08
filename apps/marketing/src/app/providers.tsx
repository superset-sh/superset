"use client";

import { OutlitProvider } from "@outlit/browser/react";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { env } from "@/env";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<OutlitProvider
				publicKey={env.NEXT_PUBLIC_OUTLIT_KEY ?? ""}
				trackPageviews
				autoTrack={false}
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
			</OutlitProvider>
		</PostHogProvider>
	);
}
