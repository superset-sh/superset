import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { UsageWorkspacesPage } from "../components/UsageWorkspacesPage";
import { useRecordUsageSection } from "../hooks/useRecordUsageSection";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/workspaces/",
)({
	component: WorkspacesUsagePage,
});

function WorkspacesUsagePage() {
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return <UsageWorkspacesPage hostUrl={activeHostUrl} />;
}
