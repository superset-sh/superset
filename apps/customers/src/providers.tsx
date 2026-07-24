import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { Toaster } from "@superset/ui/sonner";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "./trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
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
					<Toaster />
					<ReactQueryDevtools initialIsOpen={false} />
				</ThemeProvider>
			</TRPCReactProvider>
		</PostHogProvider>
	);
}
