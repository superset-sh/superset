import { createFileRoute } from "@tanstack/react-router";
import { LuFolderGit2 } from "react-icons/lu";
import { V2ProjectDetailHeader } from "./components/V2ProjectDetailHeader";
import { V2ProjectDetailWorkspaces } from "./components/V2ProjectDetailWorkspaces";
import { useV2ProjectDetail } from "./hooks/useV2ProjectDetail";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-project/$projectId/",
)({
	component: V2ProjectDetailPage,
});

function V2ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const { project, workspaces, isLoading } = useV2ProjectDetail(projectId);

	if (isLoading) {
		return (
			<div className="flex h-full w-full flex-1 flex-col bg-card" aria-busy>
				<div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3">
					<div className="h-4 w-24 animate-pulse rounded bg-muted" />
					<div className="flex items-center gap-3">
						<div className="size-9 animate-pulse rounded-md bg-muted" />
						<div className="flex flex-col gap-1.5">
							<div className="h-4 w-48 animate-pulse rounded bg-muted" />
							<div className="h-3 w-24 animate-pulse rounded bg-muted" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-card p-8 text-center">
				<LuFolderGit2 className="size-8 text-muted-foreground" />
				<h1 className="text-base font-semibold">Project not found</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					This project may have been deleted, or you might not be a member of
					the organization that owns it.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-card">
			<V2ProjectDetailHeader project={project} />
			<V2ProjectDetailWorkspaces
				projectId={project.id}
				workspaces={workspaces}
			/>
		</div>
	);
}
