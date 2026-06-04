import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Marketplace",
	description: "Browse shared themes and future agent configs for Superset.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/marketplace`,
	},
};

const marketplaceLinks = [
	{
		href: "/marketplace/themes",
		label: "Themes",
		description: "Shared theme JSON files you can import into Superset.",
	},
	{
		href: "/marketplace/agents",
		label: "Agent Configs",
		description: "Future home for reusable agent configs.",
	},
] as const;

export default function MarketplacePage() {
	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						Marketplace
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose a section.
					</p>
				</div>

				<div className="border border-border">
					{marketplaceLinks.map((link, index) => (
						<Link
							key={link.href}
							href={link.href}
							className={`block px-4 py-4 transition-colors hover:bg-accent/10 ${
								index > 0 ? "border-t border-border" : ""
							}`}
						>
							<div className="text-sm font-medium text-foreground">
								{link.label}
							</div>
							<div className="mt-1 text-sm text-muted-foreground">
								{link.description}
							</div>
						</Link>
					))}
				</div>
			</div>
		</main>
	);
}
