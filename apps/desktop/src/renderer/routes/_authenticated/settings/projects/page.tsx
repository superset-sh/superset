import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HiChevronRight } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsListPage,
});

function ProjectsListPage() {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const navigate = useNavigate();

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Projects</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Select a project to configure its settings
				</p>
			</div>

			{groups.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No projects yet. Import a repository to get started.
				</p>
			) : (
				<div className="space-y-1">
					{groups.map((group) => (
						<button
							key={group.project.id}
							type="button"
							onClick={() =>
								navigate({
									to: "/settings/project/$projectId/general",
									params: { projectId: group.project.id },
								})
							}
							className={cn(
								"flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left",
								"hover:bg-accent/50 group",
							)}
						>
							<div
								className="w-3 h-3 rounded-full shrink-0"
								style={{ backgroundColor: group.project.color }}
							/>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">
									{group.project.name}
								</p>
								<p className="text-xs text-muted-foreground truncate">
									{group.project.mainRepoPath}
								</p>
							</div>
							<HiChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
						</button>
					))}
				</div>
			)}
		</div>
	);
}
