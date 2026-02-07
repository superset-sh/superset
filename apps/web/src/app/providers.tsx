"use client";

import { OutlitProvider } from "@outlit/browser/react";
import { authClient } from "@superset/auth/client";
import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";
import { env } from "@/env";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	return (
		<PostHogProvider client={posthog}>
			<OutlitProvider
				publicKey={env.NEXT_PUBLIC_OUTLIT_KEY ?? ""}
				trackPageviews
				user={
					user
						? {
								email: user.email,
								userId: user.id,
								traits: { name: user.name },
							}
						: null
				}
			>
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
			</OutlitProvider>
		</PostHogProvider>
	);
}
