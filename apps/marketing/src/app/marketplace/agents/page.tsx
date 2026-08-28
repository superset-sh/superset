import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { initServerI18n } from "@/app/i18n-server";
import { marketplaceSubmissionLinks } from "@/lib/marketplace";

export const metadata: Metadata = {
	title: "Agent Configs",
	description:
		"The future home for reusable Superset agent configs, prompts, and setup guides.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/marketplace/agents`,
	},
};

export default function MarketplaceAgentsPage() {
	initServerI18n();

	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						<Trans id="marketing.marketplace.agents.title">Agent Configs</Trans>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans id="marketing.marketplace.agents.empty">
							No public agent configs yet. This route is ready for future agent
							config listings.
						</Trans>
					</p>
				</div>

				<div className="border border-border">
					<div className="border-b border-border px-4 py-3">
						<p className="text-sm text-muted-foreground">
							<Trans id="marketing.marketplace.agents.hint">
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
								<Trans id="marketing.marketplace.agents.submit">
									Submit an agent idea
								</Trans>
								<ArrowUpRight className="size-4" />
							</a>
						</Button>
					</div>
				</div>
			</div>
		</main>
	);
}
