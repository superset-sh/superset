import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { PaneViewer } from "./components/PaneViewer";
import { WorkspaceNotFoundState } from "./components/WorkspaceNotFoundState";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace/$workspaceId/",
)({
	component: V2WorkspacePage,
});

function V2WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const collections = useCollections();

	const { data: workspaces } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;

	if (!workspaces) {
		return <div className="flex h-full w-full" />;
	}

	if (!workspace) {
		return <WorkspaceNotFoundState workspaceId={workspaceId} />;
	}

	return (
		<V2WorkspacePageContent
			key={workspace.id}
			projectId={workspace.projectId}
			workspaceId={workspace.id}
			workspaceName={workspace.name}
		/>
	);
}

function V2WorkspacePageContent({
	projectId,
	workspaceId,
	workspaceName,
}: {
	projectId: string;
	workspaceId: string;
	workspaceName: string;
}) {
	return (
		<PaneViewer
			key={workspaceId}
			projectId={projectId}
			workspaceId={workspaceId}
			workspaceName={workspaceName}
		/>
	);
}
