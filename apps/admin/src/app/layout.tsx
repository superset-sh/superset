import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { env } from "@/env";

import "./globals.css";

import { Providers } from "./providers";

const ibmPlexMono = IBM_Plex_Mono({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
});

const inter = Inter({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-inter",
});

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
		<ClerkProvider domain={env.NEXT_PUBLIC_COOKIE_DOMAIN} isSatellite={false}>
			<html lang="en" suppressHydrationWarning>
				<body
					className={cn(
						"bg-background text-foreground min-h-screen font-sans antialiased",
						inter.variable,
						ibmPlexMono.variable,
					)}
				>
					<Providers>
						{children}
						<Toaster />
					</Providers>
				</body>
			</html>
		</ClerkProvider>
	);
}
