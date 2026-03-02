import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Open Task - Superset",
	description: "Open this task in the Superset desktop app.",
};

export default function TaskDeepLinkLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
