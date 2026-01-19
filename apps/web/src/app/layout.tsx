import { Toaster } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

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
	title: "Superset",
	description: "Run 10+ parallel coding agents on your machine",
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
			<head>
				<link rel="manifest" href="/manifest.webmanifest" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
				<meta name="apple-mobile-web-app-title" content="Superset" />
				<link rel="apple-touch-icon" href="/icons/icon-192.png" />
			</head>
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
				<ServiceWorkerRegistration />
			</body>
		</html>
	);
}

function ServiceWorkerRegistration() {
	return (
		<script
			dangerouslySetInnerHTML={{
				__html: `
					if ('serviceWorker' in navigator) {
						window.addEventListener('load', function() {
							navigator.serviceWorker.register('/sw.js').catch(function(err) {
								console.log('[sw] Registration failed:', err);
							});
						});
					}
				`,
			}}
		/>
	);
}
