import { createFileRoute } from "@tanstack/react-router";
import { useSettingsHost } from "../../hooks/useSettingsHost";
import { UsageWorkspacesPage } from "../components/UsageWorkspacesPage";
import { useRecordUsageSection } from "../hooks/useRecordUsageSection";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/workspaces/",
)({
	component: WorkspacesUsagePage,
});

function WorkspacesUsagePage() {
	const { hostUrl } = useSettingsHost();
	useRecordUsageSection("token");

	return <UsageWorkspacesPage hostUrl={hostUrl} />;
}
