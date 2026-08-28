import { createFileRoute } from "@tanstack/react-router";
import { UsageResourcesPage } from "../components/UsageResourcesPage";
import { useRecordUsageSection } from "../hooks/useRecordUsageSection";

export const Route = createFileRoute(
	"/_authenticated/settings/usage/resources/",
)({
	component: ResourcesPage,
});

function ResourcesPage() {
	useRecordUsageSection("resources");

	return <UsageResourcesPage />;
}
