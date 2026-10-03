import { Trans } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { z } from "zod";
import { useSettingsHost } from "../hooks/useSettingsHost";
import { UsageView } from "./components/UsageView";
import { useRecordUsageSection } from "./hooks/useRecordUsageSection";

export const Route = createFileRoute("/_authenticated/settings/usage/")({
	validateSearch: z.object({
		workspaceId: z.string().optional(),
		accountKey: z.string().optional(),
		agent: z.string().optional(),
	}),
	component: UsagePage,
});

function UsagePage() {
	const {
		hostUrl: settingsHostUrl,
		hostName,
		isLocal,
		isOnline,
	} = useSettingsHost();
	const { workspaceId, accountKey, agent } = Route.useSearch();
	const workspaceTarget = useWorkspaceHostTarget(workspaceId ?? null);
	useRecordUsageSection("token");

	const hostUrl = workspaceId
		? workspaceTarget.status === "ready"
			? workspaceTarget.url
			: null
		: settingsHostUrl;

	if (!workspaceId && !isLocal && !isOnline) {
		return (
			<div className="mx-auto w-full max-w-5xl px-6 py-10 text-center text-sm text-muted-foreground">
				<Trans>
					{hostName} is offline. Its usage appears here when it reconnects.
				</Trans>
			</div>
		);
	}

	return (
		<UsageView
			key={hostUrl}
			hostUrl={hostUrl}
			focusedAccountKey={accountKey}
			focusedAgent={agent}
		/>
	);
}
