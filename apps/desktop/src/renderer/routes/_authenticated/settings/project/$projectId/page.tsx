import { createFileRoute, notFound } from "@tanstack/react-router";
import { trpcClient } from "renderer/lib/trpc-client";
import { NotFound } from "renderer/routes/not-found";

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
						trpcClient.projects.get.query({ id: params.projectId }),
				}),
				context.queryClient.ensureQueryData({
					queryKey: configQueryKey,
					queryFn: () =>
						trpcClient.config.getConfigFilePath.query({
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

import { HiOutlineCog6Tooth, HiOutlineFolder } from "react-icons/hi2";
import { ConfigFilePreview } from "renderer/components/ConfigFilePreview";
import { trpc } from "renderer/lib/trpc";

function ProjectSettingsPage() {
	const { projectId } = Route.useParams();
	const { data: project } = trpc.projects.get.useQuery({
		id: projectId,
	});

	const { data: configFilePath } = trpc.config.getConfigFilePath.useQuery({
		projectId,
	});

	// Project is guaranteed to exist here because loader handles 404s
	if (!project) {
		return null;
	}

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Project</h2>
			</div>

			<div className="space-y-6">
				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground">Name</h3>
					<p>{project.name}</p>
				</div>

				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Repository Path
					</h3>
					<p className="text-sm font-mono break-all">{project.mainRepoPath}</p>
				</div>

				<div className="pt-4 border-t space-y-4">
					<div className="space-y-2">
						<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
							<HiOutlineCog6Tooth className="h-4 w-4" />
							Scripts
						</h3>
						<p className="text-sm text-muted-foreground">
							Configure setup and teardown scripts that run when workspaces are
							created or deleted.
						</p>
					</div>
					<ConfigFilePreview
						projectId={project.id}
						projectName={project.name}
						configFilePath={configFilePath ?? undefined}
					/>
				</div>
			</div>
		</div>
	);
}
