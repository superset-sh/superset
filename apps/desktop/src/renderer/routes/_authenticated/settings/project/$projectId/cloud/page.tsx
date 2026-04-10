import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useDesktopFeatureFlagEnabled } from "renderer/lib/useDesktopFeatureFlagEnabled";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/cloud/",
)({
	component: CloudSettingsIndex,
});

function CloudSettingsIndex() {
	const { projectId } = Route.useParams();
	const hasCloudAccess = useDesktopFeatureFlagEnabled(
		FEATURE_FLAGS.CLOUD_ACCESS,
	);

	if (!hasCloudAccess) {
		return (
			<Navigate
				to="/settings/project/$projectId/general"
				params={{ projectId }}
				replace
			/>
		);
	}

	return (
		<Navigate
			to="/settings/project/$projectId/cloud/secrets"
			params={{ projectId }}
			replace
		/>
	);
}
