import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Script from "next/script";
import { TRPCReactProvider } from "@/trpc/react";
import "./globals.css";

export const metadata: Metadata = {
	title: "Superset - The last developer tool you'll ever need",
	description:
		"The last developer tool you'll ever need. Work in parallel with always-on agents, zero switching cost, and bring your own tools.",
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
