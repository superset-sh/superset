import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { V2WorkspaceLoadingView } from "./components/V2WorkspaceLoadingView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace-loading/$workspaceId/",
)({
	component: V2WorkspaceLoadingPage,
});

function V2WorkspaceLoadingPage() {
	const { workspaceId } = Route.useParams();
	const navigate = useNavigate();
	const collections = useCollections();

	const { data: workspaces, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ v2Workspaces: collections.v2Workspaces })
				.where(({ v2Workspaces }) => eq(v2Workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces?.[0] ?? null;

	useEffect(() => {
		if (!isReady) return;
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
			replace: true,
		});
	}, [isReady, navigate, workspaceId]);

	return <V2WorkspaceLoadingView workspaceName={workspace?.name} />;
}
