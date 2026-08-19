"use client";

import {
	INTEGRATIONS,
	type IntegrationProvider,
} from "@superset/shared/integrations";
import type { ReactNode } from "react";
import { BsMicrosoftTeams } from "react-icons/bs";
import { FaGithub, FaGoogle, FaSlack } from "react-icons/fa";
import { SiLinear, SiNotion, SiSentry } from "react-icons/si";
import {
	IntegrationCard,
	type IntegrationCardProps,
} from "./components/IntegrationCard";

const CARD_STYLES: Record<
	IntegrationProvider,
	{ accentColor: string; icon: ReactNode }
> = {
	linear: { accentColor: "#5E6AD2", icon: <SiLinear className="size-8" /> },
	github: { accentColor: "#238636", icon: <FaGithub className="size-8" /> },
	slack: { accentColor: "#4A154B", icon: <FaSlack className="size-8" /> },
	notion: { accentColor: "#5F5E5B", icon: <SiNotion className="size-8" /> },
	microsoft_teams: {
		accentColor: "#5B5FC7",
		icon: <BsMicrosoftTeams className="size-8" />,
	},
	sentry: { accentColor: "#362D59", icon: <SiSentry className="size-8" /> },
	google: { accentColor: "#4285F4", icon: <FaGoogle className="size-8" /> },
};

const integrations: IntegrationCardProps[] = INTEGRATIONS.map(
	(integration) => ({
		id: integration.webPath.replace("/integrations/", ""),
		name: integration.label,
		description: integration.description,
		category: integration.category,
		...CARD_STYLES[integration.provider],
	}),
);

export default function IntegrationsPage() {
	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-xl font-semibold">Featured</h2>
				<p className="text-muted-foreground">
					A selection of integrations curated by our team.
				</p>

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{integrations.map((integration) => (
						<IntegrationCard key={integration.id} {...integration} />
					))}
				</div>
			</section>
		</div>
	);
}
