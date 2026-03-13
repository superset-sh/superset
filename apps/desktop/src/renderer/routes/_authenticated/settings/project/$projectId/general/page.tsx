import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { NotFound } from "renderer/routes/not-found";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../../../utils/settings-search";
import { ProjectSettings } from "../components/ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/project/$projectId/general/",
)({
	component: GeneralSettingsPage,
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
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			throw error;
		}
	},
});

function GeneralSettingsPage() {
	const { projectId } = Route.useParams();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "project").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <ProjectSettings projectId={projectId} visibleItems={visibleItems} />;
}
