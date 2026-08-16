import { createFileRoute } from "@tanstack/react-router";
import { PluginDetailPage } from "./components/PluginDetailPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/plugins/$pluginId/",
)({
	component: PluginDetailRoute,
});

function PluginDetailRoute() {
	const { pluginId } = Route.useParams();
	return <PluginDetailPage pluginId={pluginId} />;
}
