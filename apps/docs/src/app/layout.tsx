import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@superset/i18n/react";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { initServerI18n } from "@/lib/i18n-server";
import "./global.css";
import { COMPANY } from "@superset/shared/constants";
import { Inter } from "next/font/google";
import { NavigationBar } from "@/app/components/NavigationBar";
import { NavbarProvider } from "@/app/components/NavigationBar/components/NavigationMobile";

const inter = Inter({
	subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
	const i18n = await initServerI18n();
	const ogLocale = new Intl.Locale(i18n.locale).maximize();
	return {
		metadataBase: new URL(COMPANY.DOCS_URL),
		title: {
			default: i18n._(msg({ message: `${COMPANY.NAME} Documentation` })),
			template: i18n._(msg({ message: `%s | ${COMPANY.NAME} Docs` })),
		},
		description: i18n._(
			msg({
				message: `Official documentation for ${COMPANY.NAME}. Learn how to run 100+ coding agents in parallel on your machine.`,
			}),
		),
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
			locale: `${ogLocale.language}_${ogLocale.region}`,
			url: COMPANY.DOCS_URL,
			siteName: `${COMPANY.NAME} Docs`,
			title: i18n._(msg({ message: `${COMPANY.NAME} Documentation` })),
			description: i18n._(
				msg({
					message: `Official documentation for ${COMPANY.NAME}, the app for running 100+ coding agents in parallel.`,
				}),
			),
		},
		twitter: {
			card: "summary_large_image",
			title: i18n._(msg({ message: `${COMPANY.NAME} Documentation` })),
			description: i18n._(
				msg({
					message: `Official documentation for ${COMPANY.NAME}, the app for running 100+ coding agents in parallel.`,
				}),
			),
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
}

export default async function Layout({ children }: LayoutProps<"/">) {
	const i18n = await initServerI18n();
	return (
		<html
			lang={i18n.locale}
			className={`${inter.className} overscroll-none`}
			suppressHydrationWarning
		>
			<body className="flex flex-col min-h-screen overscroll-none">
				<I18nProvider
					locale={
						i18n.locale as import("@superset/i18n/locales").SupportedLocale
					}
					initialMessages={i18n.messages}
				>
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
