import { createFileRoute } from "@tanstack/react-router";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { z } from "zod";
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
	const { activeHostUrl } = useLocalHostService();
	const { workspaceId, accountKey, agent } = Route.useSearch();
	const workspaceHostUrl = useWorkspaceHostUrl(workspaceId ?? null);
	useRecordUsageSection("token");

	return (
		<UsageView
			hostUrl={workspaceId ? workspaceHostUrl : activeHostUrl}
			focusedAccountKey={accountKey}
			focusedAgent={agent}
		/>
	);
}
