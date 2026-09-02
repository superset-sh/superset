import { initI18n } from "@superset/i18n";
import { I18nProvider } from "@superset/i18n/react";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
import { COMPANY } from "@superset/shared/constants";
import { Inter } from "next/font/google";
import { NavigationBar } from "@/app/components/NavigationBar";
import { NavbarProvider } from "@/app/components/NavigationBar/components/NavigationMobile";

const inter = Inter({
	subsets: ["latin"],
});

// Server components render outside I18nProvider (which is client-only), and
// `i18n._` throws on an unactivated instance. Activating at module scope means
// the server module graph is ready before any RSC in this tree renders.
initI18n();

export const metadata: Metadata = {
	metadataBase: new URL(COMPANY.DOCS_URL),
	title: {
		default: `${COMPANY.NAME} Documentation`,
		template: `%s | ${COMPANY.NAME} Docs`,
	},
	description: `Official documentation for ${COMPANY.NAME}. Learn how to run 100+ coding agents in parallel on your machine.`,
	keywords: [
		`${COMPANY.NAME} documentation`,
		"coding agents docs",
		"parallel execution guide",
		"developer tools",
	],
	authors: [{ name: `${COMPANY.NAME} Team` }],
	creator: COMPANY.NAME,
	openGraph: {
		type: "website",
		locale: "en_US",
		url: COMPANY.DOCS_URL,
		siteName: `${COMPANY.NAME} Docs`,
		title: `${COMPANY.NAME} Documentation`,
		description: `Official documentation for ${COMPANY.NAME}, the app for running 100+ coding agents in parallel.`,
	},
	twitter: {
		card: "summary_large_image",
		title: `${COMPANY.NAME} Documentation`,
		description: `Official documentation for ${COMPANY.NAME}, the app for running 100+ coding agents in parallel.`,
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
};

export default function Layout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={`${inter.className} overscroll-none`}
			suppressHydrationWarning
		>
			<body className="flex flex-col min-h-screen overscroll-none">
				<I18nProvider>
					<RootProvider>
						<NavbarProvider>
							<NavigationBar />
							{children}
						</NavbarProvider>
					</RootProvider>
				</I18nProvider>
			</body>
		</html>
	);
}
