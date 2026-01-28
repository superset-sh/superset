import { createFileRoute, notFound } from "@tanstack/react-router";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { NotFound } from "renderer/routes/not-found";
import { ProjectSettings } from "./components/ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/",
)({
	component: ProjectSettingsPage,
	notFoundComponent: NotFound,
	loader: async ({ params, context }) => {
		const projectQueryKey = [
			["projects", "get"],
			{ input: { id: params.projectId }, type: "query" },
		];

		const configQueryKey = [
			["config", "getConfigFilePath"],
			{ input: { projectId: params.projectId }, type: "query" },
		];

		try {
			await Promise.all([
				context.queryClient.ensureQueryData({
					queryKey: projectQueryKey,
					queryFn: () =>
						electronTrpcClient.projects.get.query({ id: params.projectId }),
				}),
				context.queryClient.ensureQueryData({
					queryKey: configQueryKey,
					queryFn: () =>
						electronTrpcClient.config.getConfigFilePath.query({
							projectId: params.projectId,
						}),
				}),
			]);
		} catch (error) {
			// If project not found, throw notFound() to render 404 page
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			// Re-throw other errors
			throw error;
		}
	},
});

function ProjectSettingsPage() {
	const { projectId } = Route.useParams();
	return <ProjectSettings projectId={projectId} />;
}
