"use client";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<TRPCReactProvider>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				storageKey="superset-admin-theme"
			>
				{children}
				<ReactQueryDevtools initialIsOpen={false} />
			</ThemeProvider>
		</TRPCReactProvider>
	);
}
