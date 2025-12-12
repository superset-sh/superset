"use client";

import { THEME_STORAGE_KEY } from "@superset/shared/constants";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<TRPCReactProvider>
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				forcedTheme="dark"
				storageKey={THEME_STORAGE_KEY}
				disableTransitionOnChange
			>
				{children}
				<ReactQueryDevtools initialIsOpen={false} />
			</ThemeProvider>
		</TRPCReactProvider>
	);
}
