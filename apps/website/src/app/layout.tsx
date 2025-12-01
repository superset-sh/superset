import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Script from "next/script";
import { TRPCReactProvider } from "@/trpc/react";
import "./globals.css";

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
			className={`overscroll-none ${GeistSans.variable} ${GeistMono.variable}`}
		>
			<head>
				<Script
					src="https://tally.so/widgets/embed.js"
					strategy="afterInteractive"
				/>
			</head>
			<body className="overscroll-none font-sans">
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}
