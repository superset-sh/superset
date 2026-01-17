import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Script from "next/script";

import { CookieConsent } from "@/components/CookieConsent";

import { CTAButtons } from "./components/CTAButtons";
import { Footer } from "./components/Footer";
import { GitHubStarCounter } from "./components/GitHubStarCounter";
import { Header } from "./components/Header";
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
	title: "Superset - Run 10+ parallel coding agents on your machine",
	description:
		"Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish. Quickly switch between tasks as they need your attention.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`overscroll-none ${ibmPlexMono.variable} ${inter.variable}`}
			suppressHydrationWarning
		>
			<head>
				<Script
					src="https://tally.so/widgets/embed.js"
					strategy="afterInteractive"
				/>
			</head>
			<body className="overscroll-none font-sans">
				<Providers>
					<Header
						ctaButtons={<CTAButtons />}
						starCounter={<GitHubStarCounter />}
					/>
					{children}
					<Footer />
					<CookieConsent />
				</Providers>
			</body>
		</html>
	);
}
