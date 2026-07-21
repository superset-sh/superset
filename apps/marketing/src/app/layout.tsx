import { COMPANY } from "@superset/shared/constants";
import { GeistPixelGrid, GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Micro_5, Pixelify_Sans } from "next/font/google";
import Script from "next/script";

import { CookieConsent } from "@/components/CookieConsent";
import {
	OrganizationJsonLd,
	SoftwareApplicationJsonLd,
	WebsiteJsonLd,
} from "@/components/JsonLd";
import { REDDIT_PIXEL_ID } from "@/lib/constants";

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

const pixelifySans = Pixelify_Sans({
	weight: ["400", "500", "600", "700"],
	subsets: ["latin"],
	variable: "--font-pixel",
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
			className={`dark overscroll-none ${ibmPlexMono.variable} ${inter.variable} ${micro5.variable} ${pixelifySans.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable}`}
			suppressHydrationWarning
		>
			<head>
				<OrganizationJsonLd />
				<SoftwareApplicationJsonLd />
				<WebsiteJsonLd />
				{/* Google tag (gtag.js) — Google Ads */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=AW-18209336001"
					strategy="afterInteractive"
				/>
				<Script id="google-ads-gtag" strategy="afterInteractive">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'AW-18209336001');
					`}
				</Script>
				{/* Reddit Pixel */}
				<Script id="reddit-pixel" strategy="afterInteractive">
					{`
						!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
						rdt('init','${REDDIT_PIXEL_ID}');
						rdt('track','PageVisit');
					`}
				</Script>
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
