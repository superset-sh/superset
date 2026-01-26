import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
import { Inter } from "next/font/google";
import { NavigationBar } from "@/app/components/NavigationBar";
import { NavbarProvider } from "@/app/components/NavigationBar/components/NavigationMobile";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	metadataBase: new URL("https://docs.superset.sh"),
	title: {
		default: "Superset Documentation",
		template: "%s | Superset Docs",
	},
	description:
		"Official documentation for Superset - the terminal for coding agents. Learn how to run parallel coding agents on your machine.",
	keywords: [
		"Superset documentation",
		"coding agents docs",
		"parallel execution guide",
		"developer tools",
	],
	authors: [{ name: "Superset Team" }],
	creator: "Superset",
	openGraph: {
		type: "website",
		locale: "en_US",
		url: "https://docs.superset.sh",
		siteName: "Superset Docs",
		title: "Superset Documentation",
		description:
			"Official documentation for Superset - the terminal for coding agents.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Superset Documentation",
		description:
			"Official documentation for Superset - the terminal for coding agents.",
		creator: "@AviSupersetSH",
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
				<RootProvider>
					<NavbarProvider>
						<NavigationBar />
						{children}
					</NavbarProvider>
				</RootProvider>
			</body>
		</html>
	);
}
