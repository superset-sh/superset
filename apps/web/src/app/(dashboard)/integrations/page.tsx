"use client";

import { FaGithub } from "react-icons/fa";
import { SiLinear } from "react-icons/si";
import {
	IntegrationCard,
	type IntegrationCardProps,
} from "./components/IntegrationCard";

const integrations: IntegrationCardProps[] = [
	{
		id: "linear",
		name: "Linear",
		description: "Sync issues bidirectionally with Linear.",
		category: "Task Management",
		accentColor: "#5E6AD2",
		icon: <SiLinear className="size-8" />,
	},
	{
		id: "github",
		name: "GitHub",
		description: "Connect repos and sync pull requests.",
		category: "Version Control",
		accentColor: "#FFFFFF",
		icon: <FaGithub className="size-8" />,
	},
];

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
