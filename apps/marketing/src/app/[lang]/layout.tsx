import { SUPPORTED_LOCALES } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
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
import "../globals.css";
import { initServerI18n } from "../i18n-server";
import { Providers } from "../providers";

const ibmPlexMono = IBM_Plex_Mono({
	weight: ["300", "400", "500"],
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
	display: "swap",
	// Not used by the LCP hero text; keep it off the critical preload path
	preload: false,
});

// Variable font with the opsz axis: large sizes render as Inter Display
const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
	axes: ["opsz"],
});

const siteDescription =
	"Bring Claude Code, Codex, OpenCode, or any coding agent into one workspace. Run tasks in parallel, isolate changes, and review everything in one place.";

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.MARKETING_URL),
	title: {
		default: `${COMPANY.NAME} - Orchestrate any coding agent`,
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
		title: `${COMPANY.NAME} - Orchestrate any coding agent`,
		description: siteDescription,
		images: [
			{
				url: "/og-image.png",
				width: 2400,
				height: 1260,
				alt: `${COMPANY.NAME} - Orchestrate any coding agent`,
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: `${COMPANY.NAME} - Orchestrate any coding agent`,
		description: siteDescription,
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

// Declares the locale space for the [lang] segment. Pages themselves stay
// dynamic (the nav resolves the viewer's session), but Next validates and
// types the param set from this.
export function generateStaticParams() {
	return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await initServerI18n();

	return (
		<html
			lang={locale}
			className={`dark overscroll-none ${ibmPlexMono.variable} ${inter.variable}`}
			suppressHydrationWarning
		>
			<head>
				<OrganizationJsonLd />
				<SoftwareApplicationJsonLd />
				<WebsiteJsonLd />
				{/* Google tag (gtag.js) for Google Ads */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=AW-18209336001"
					strategy="lazyOnload"
				/>
				<Script id="google-ads-gtag" strategy="lazyOnload">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'AW-18209336001');
					`}
				</Script>
				{/* Reddit Pixel */}
				<Script id="reddit-pixel" strategy="lazyOnload">
					{`
						!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
						rdt('init','${REDDIT_PIXEL_ID}');
						rdt('track','PageVisit');
					`}
				</Script>
			</head>
			<body className="overscroll-none font-sans">
				<Providers locale={locale}>
					<Header
						ctaButtons={<CTAButtons />}
						starCounter={<GitHubStarCounter />}
					/>
					{children}
					<Footer locale={locale} />
					<CookieConsent />
				</Providers>
			</body>
		</html>
	);
}
