import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { PaneViewer } from "./components/PaneViewer";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;

	if (!workspace) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Workspace not found
			</div>
		);
	}

	return (
		<V2WorkspacePageContent
			key={workspace.id}
			projectId={workspace.projectId}
			workspaceBranch={workspace.branch}
			workspaceId={workspace.id}
			workspaceName={workspace.name}
		/>
	);
}

function V2WorkspacePageContent({
	projectId,
	workspaceBranch,
	workspaceId,
	workspaceName,
}: {
	projectId: string;
	workspaceBranch: string;
	workspaceId: string;
	workspaceName: string;
}) {
	return (
		<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
			<PaneViewer
				key={workspaceId}
				projectId={projectId}
				workspaceBranch={workspaceBranch}
				workspaceId={workspaceId}
				workspaceName={workspaceName}
			/>
		</div>
	);
}
