"use client";

import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	type IntegrationProvider,
	offeredIntegrations,
} from "@superset/shared/integrations";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlagPayload } from "posthog-js/react";
import { type ReactNode, useEffect, useState } from "react";
import { BsMicrosoftTeams } from "react-icons/bs";
import { FaGithub, FaGoogle, FaSlack } from "react-icons/fa";
import { SiLinear, SiNotion, SiSentry } from "react-icons/si";
import { useTRPC } from "@/trpc/react";
import { IntegrationCard } from "./components/IntegrationCard";
import { ProFeaturesPaywall } from "./components/ProFeaturesPaywall";

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

const PRO_FEATURE: Partial<Record<IntegrationProvider, string>> = {
	linear: "tasks",
	github: "remote-access",
};

function isProGated(value: string | null): value is IntegrationProvider {
	return value !== null && value in PRO_FEATURE;
}

export default function IntegrationsPage() {
	const trpc = useTRPC();
	const { data: organization } = useQuery(
		trpc.user.myOrganization.queryOptions(),
	);
	const { data: syncAllowed } = useQuery({
		...trpc.integration.syncAllowed.queryOptions({
			organizationId: organization?.id ?? "",
		}),
		enabled: !!organization,
	});
	const [paywallFor, setPaywallFor] = useState<IntegrationProvider | null>(
		null,
	);

	// The Linear and GitHub pages and connect routes send a free organization
	// here with ?pro=<provider>.
	useEffect(() => {
		const pro = new URLSearchParams(window.location.search).get("pro");
		if (!isProGated(pro)) return;
		setPaywallFor(pro);
		window.history.replaceState({}, "", "/integrations");
	}, []);

	// Before the flag resolves this is the standalone set, which is what
	// everyone outside the flag sees anyway; the trigger-only providers join
	// once the payload arrives.
	const enabledTriggerKinds = useFeatureFlagPayload(
		FEATURE_FLAGS.AUTOMATION_EVENT_TRIGGERS,
	);
	const integrations = offeredIntegrations(enabledTriggerKinds);

	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-xl font-semibold">
					<Trans>Featured</Trans>
				</h2>
				<p className="text-muted-foreground">
					<Trans>A selection of integrations curated by our team.</Trans>
				</p>

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{integrations.map((integration) => (
						<IntegrationCard
							key={integration.provider}
							id={integration.webPath.replace("/integrations/", "")}
							name={integration.label}
							description={integration.description()}
							category={integration.category()}
							{...CARD_STYLES[integration.provider]}
							onClick={
								syncAllowed === false && integration.provider in PRO_FEATURE
									? () => setPaywallFor(integration.provider)
									: undefined
							}
						/>
					))}
				</div>
			</section>

			<ProFeaturesPaywall
				featureId={paywallFor ? (PRO_FEATURE[paywallFor] ?? null) : null}
				triggerSource={paywallFor && `integration-${paywallFor}`}
				onClose={() => setPaywallFor(null)}
			/>
		</div>
	);
}
