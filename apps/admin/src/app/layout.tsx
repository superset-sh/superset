import { Toaster } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Script from "next/script";

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
	title: "Superset | Company Dashboard",
	description: "Analytics, Ops, and more",
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "32x32" },
			{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
		],
	},
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
				<Script id="strip-katalon-attrs" strategy="beforeInteractive">
					{`(function(){try{var attrs=document.documentElement.attributes;for(var i=attrs.length-1;i>=0;i--){var name=attrs[i].name;if(name&&name.toLowerCase().indexOf('katalon')!==-1){document.documentElement.removeAttribute(name);}}}catch(e){console.warn('strip-katalon-attrs failed',e)}})();`}
				</Script>
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
			</body>
		</html>
	);
}
