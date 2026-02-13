import { COMPANY } from "@superset/shared/constants";
import { GeistPixelGrid, GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Micro_5 } from "next/font/google";
import Script from "next/script";
import { CookieConsent } from "@/components/CookieConsent";
import {
	OrganizationJsonLd,
	SoftwareApplicationJsonLd,
	WebsiteJsonLd,
} from "@/components/JsonLd";

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
	display: "swap",
});

const inter = Inter({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const micro5 = Micro_5({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-micro5",
	display: "swap",
});

const siteDescription =
	"Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish. Quickly switch between tasks as they need your attention.";

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.MARKETING_URL),
	title: {
		default: `${COMPANY.NAME} - Run 10+ parallel coding agents on your machine`,
		template: `%s | ${COMPANY.NAME}`,
	},
	description: siteDescription,
	keywords: [
		"coding agents",
		"parallel execution",
		"developer tools",
		"AI coding",
		"git worktrees",
		"code automation",
		"Claude Code",
		"Cursor",
		"Codex",
	],
	authors: [{ name: `${COMPANY.NAME} Team` }],
	creator: COMPANY.NAME,
	openGraph: {
		type: "website",
		locale: "en_US",
		url: COMPANY.MARKETING_URL,
		siteName: COMPANY.NAME,
		title: `${COMPANY.NAME} - Run 10+ parallel coding agents on your machine`,
		description:
			"Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish.",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: `${COMPANY.NAME} - The Terminal for Coding Agents`,
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: `${COMPANY.NAME} - Run 10+ parallel coding agents on your machine`,
		description:
			"Run 10+ parallel coding agents on your machine. Spin up new coding tasks while waiting for your current agent to finish.",
		images: ["/og-image.png"],
		creator: "@superset_sh",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "32x32" },
			{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
		],
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
	},
	manifest: "/manifest.json",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`dark overscroll-none ${ibmPlexMono.variable} ${inter.variable} ${micro5.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable}`}
			suppressHydrationWarning
		>
			<head>
				<Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />
				<OrganizationJsonLd />
				<SoftwareApplicationJsonLd />
				<WebsiteJsonLd />
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
