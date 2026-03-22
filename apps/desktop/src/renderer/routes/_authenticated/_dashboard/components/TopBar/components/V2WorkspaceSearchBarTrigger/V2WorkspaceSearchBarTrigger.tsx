import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "../../../../../providers/CollectionsProvider";
import { SearchBarTrigger } from "../SearchBarTrigger";

interface V2WorkspaceSearchBarTriggerProps {
	workspaceId: string;
}

export function V2WorkspaceSearchBarTrigger({
	workspaceId,
}: V2WorkspaceSearchBarTriggerProps) {
	const collections = useCollections();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId)),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;

	return (
		<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
			<div className="pointer-events-auto">
				<SearchBarTrigger workspaceName={workspace?.name} />
			</div>
		</div>
	);
}
