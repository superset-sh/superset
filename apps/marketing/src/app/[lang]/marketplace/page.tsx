import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Marketplace",
			}),
		),
		description: i18n._(
			msg({
				message: "Browse shared themes and future agent configs for Superset.",
			}),
		),
		alternates: localizedAlternates(lang, "/marketplace"),
	};
}

const marketplaceLinks = [
	{
		href: "/marketplace/themes",
		label: msg({ message: "Themes" }),
		description: msg({
			message: "Shared theme JSON files you can import into Superset.",
		}),
	},
	{
		href: "/marketplace/agents",
		label: msg({
			message: "Agent Configs",
		}),
		description: msg({
			message: "Future home for reusable agent configs.",
		}),
	},
] as const;

export default async function MarketplacePage() {
	await initServerI18n();

	const { t } = useLingui();

	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						<Trans>Marketplace</Trans>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans>Choose a section.</Trans>
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
								{t(link.label)}
							</div>
							<div className="mt-1 text-sm text-muted-foreground">
								{t(link.description)}
							</div>
						</Link>
					))}
				</div>
			</div>
		</main>
	);
}
