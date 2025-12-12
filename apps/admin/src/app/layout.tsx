import { Toaster } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import "./globals.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
	title: "Superset Admin",
	description: "Admin dashboard for Superset",
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "black" },
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={cn(
					"bg-background text-foreground min-h-screen font-sans antialiased",
					GeistSans.variable,
					GeistMono.variable,
				)}
			>
				<Providers>
					{children}
					<Toaster />
				</Providers>
			</body>
		</html>
	);
}
