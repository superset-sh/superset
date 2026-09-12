import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { usePluginCatalog } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";
import { PluginDetail } from "./components/PluginDetail";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/plugins/$pluginName/",
)({
	component: PluginDetailPage,
});

function PluginDetailPage() {
	const { pluginName } = Route.useParams();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const { plugins, isLoading } = usePluginCatalog();
	const plugin = plugins.find((entry) => entry.name === pluginName);

	if (env.NODE_ENV !== "development") {
		if (isEnabled === undefined) return null;
		if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	}
	if (isLoading) return null;
	if (!plugin) return <Redirect to="/plugins" />;

	return <PluginDetail plugin={plugin} />;
}
