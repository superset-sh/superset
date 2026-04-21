import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/settings/v2-project/$projectId/",
)({
	component: V2ProjectSettingsIndex,
});

function V2ProjectSettingsIndex() {
	const { projectId } = Route.useParams();
	return (
		<Navigate
			to="/settings/v2-project/$projectId/general"
			params={{ projectId }}
			replace
		/>
	);
}
