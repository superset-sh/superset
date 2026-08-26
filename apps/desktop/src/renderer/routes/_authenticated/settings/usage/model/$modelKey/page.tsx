import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { UsageDrilldownPage } from "../../components/UsageDrilldownPage";
import { useRecordUsageSection } from "../../hooks/useRecordUsageSection";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/model/$modelKey/",
)({
	component: ModelUsagePage,
});

function ModelUsagePage() {
	const { modelKey } = Route.useParams();
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return (
		<UsageDrilldownPage
			hostUrl={activeHostUrl}
			kind="model"
			entityKey={modelKey}
		/>
	);
}
