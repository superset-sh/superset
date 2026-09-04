import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { marketplaceSubmissionLinks } from "@/lib/marketplace";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "Agent Configs",
			}),
		),
		description: i18n._(
			msg({
				message:
					"The future home for reusable Superset agent configs, prompts, and setup guides.",
			}),
		),
		alternates: localizedAlternates(lang, "/marketplace/agents"),
	};
}

export default async function MarketplaceAgentsPage() {
	await initServerI18n();

	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						<Trans>Agent Configs</Trans>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans>
							No public agent configs yet. This route is ready for future agent
							config listings.
						</Trans>
					</p>
				</div>

				<div className="border border-border">
					<div className="border-b border-border px-4 py-3">
						<p className="text-sm text-muted-foreground">
							<Trans>
								Add agent configs here later when you want to publish them.
							</Trans>
						</p>
					</div>
					<div className="px-4 py-4">
						<Button asChild size="sm" className="rounded-none">
							<a
								href={marketplaceSubmissionLinks.agent}
								target="_blank"
								rel="noopener noreferrer"
							>
								<Trans>Submit an agent idea</Trans>
								<ArrowUpRight className="size-4" />
							</a>
						</Button>
					</div>
				</div>
			</div>
		</main>
	);
}
