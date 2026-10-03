import { createFileRoute } from "@tanstack/react-router";
import { useSettingsHost } from "../../../hooks/useSettingsHost";
import { UsageDrilldownPage } from "../../components/UsageDrilldownPage";
import { useRecordUsageSection } from "../../hooks/useRecordUsageSection";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/model/$modelKey/",
)({
	component: ModelUsagePage,
});

function ModelUsagePage() {
	const { modelKey } = Route.useParams();
	const { hostUrl } = useSettingsHost();
	useRecordUsageSection("token");

	return (
		<UsageDrilldownPage
			key={hostUrl}
			hostUrl={hostUrl}
			kind="model"
			entityKey={modelKey}
		/>
	);
}
