import { FEATURE_FLAGS } from "@superset/shared/constants";
import { getPluginByName } from "@superset/shared/plugins";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { PluginDetail } from "./components/PluginDetail";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/plugins/$pluginName/",
)({
	component: PluginDetailPage,
});

function PluginDetailPage() {
	const { pluginName } = Route.useParams();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const plugin = getPluginByName(pluginName);

	if (env.NODE_ENV !== "development") {
		if (isEnabled === undefined) return null;
		if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	}
	if (!plugin) return <Redirect to="/plugins" />;

	return <PluginDetail plugin={plugin} />;
}
