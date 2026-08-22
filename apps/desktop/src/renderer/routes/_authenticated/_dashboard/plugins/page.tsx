import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { PluginsView } from "./components/PluginsView";

export const Route = createFileRoute("/_authenticated/_dashboard/plugins/")({
	component: PluginsPage,
});

function PluginsPage() {
	// undefined = flags still resolving; render nothing rather than flashing a
	// page the user may not be in the audience for. Dev builds bypass the
	// flag — the local dev account isn't in the @superset.sh release condition.
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	if (env.NODE_ENV === "development") return <PluginsView />;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	return <PluginsView />;
}
