import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/cloud/",
)({
	component: CloudSettingsIndex,
});

function CloudSettingsIndex() {
	const { projectId } = Route.useParams();
	const hasCloudAccess = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_ACCESS);

	// undefined = flags still loading; deciding then would bounce entitled
	// users out of cloud settings.
	if (hasCloudAccess === undefined) {
		return null;
	}

	if (!hasCloudAccess) {
		return (
			<Redirect
				to="/settings/projects/$projectId"
				params={{ projectId }}
				replace
			/>
		);
	}

	return (
		<Redirect
			to="/settings/project/$projectId/cloud/secrets"
			params={{ projectId }}
			replace
		/>
	);
}
