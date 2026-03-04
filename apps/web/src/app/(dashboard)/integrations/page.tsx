"use client";

import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { FaGithub, FaSlack } from "react-icons/fa";
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
		accentColor: "#238636",
		icon: <FaGithub className="size-8" />,
	},
	{
		id: "slack",
		name: "Slack",
		description: "Connect Slack to manage tasks from conversations.",
		category: "Communication",
		accentColor: "#4A154B",
		icon: <FaSlack className="size-8" />,
	},
];

export default function IntegrationsPage() {
	const hasGithubAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.GITHUB_INTEGRATION_ACCESS,
	);
	const hasSlackAccess = useFeatureFlagEnabled(
		FEATURE_FLAGS.SLACK_INTEGRATION_ACCESS,
	);

	const visibleIntegrations = useMemo(
		() =>
			integrations.filter((i) => {
				if (i.id === "github") return hasGithubAccess;
				if (i.id === "slack") return hasSlackAccess;
				return true;
			}),
		[hasGithubAccess, hasSlackAccess],
	);

	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-xl font-semibold">Featured</h2>
				<p className="text-muted-foreground">
					A selection of integrations curated by our team.
				</p>

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{visibleIntegrations.map((integration) => (
						<IntegrationCard key={integration.id} {...integration} />
					))}
				</div>
			</section>
		</div>
	);
}
