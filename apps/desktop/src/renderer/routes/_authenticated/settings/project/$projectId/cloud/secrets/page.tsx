import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, Navigate, notFound } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { NotFound } from "renderer/routes/not-found";
import { SecretsSettings } from "./components/SecretsSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/cloud/secrets/",
)({
	component: SecretsSettingsPage,
	notFoundComponent: NotFound,
	loader: async ({ params, context }) => {
		const projectQueryKey = [
			["projects", "get"],
			{ input: { id: params.projectId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey: projectQueryKey,
				queryFn: () =>
					electronTrpcClient.projects.get.query({ id: params.projectId }),
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			throw error;
		}
	},
});

function SecretsSettingsPage() {
	const { projectId } = Route.useParams();
	const hasCloudAccess = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_ACCESS);

	if (!hasCloudAccess) {
		return (
			<Navigate
				to="/settings/project/$projectId/general"
				params={{ projectId }}
				replace
			/>
		);
	}

	return <SecretsSettings projectId={projectId} />;
}
