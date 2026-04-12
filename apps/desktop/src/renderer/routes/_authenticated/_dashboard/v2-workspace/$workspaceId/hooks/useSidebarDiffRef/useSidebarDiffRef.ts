import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { DiffRef } from "../useChangeset/types";

export function useSidebarDiffRef(workspaceId: string): DiffRef {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const sidebarState = rows[0]?.sidebarState;
	const filter = sidebarState?.changesFilter ?? { kind: "all" };
	const baseBranch = sidebarState?.baseBranch ?? null;

	switch (filter.kind) {
		case "uncommitted":
			return { kind: "uncommitted" };
		case "commit":
			return { kind: "commit", commitHash: filter.hash };
		case "range":
			return {
				kind: "commit",
				commitHash: filter.toHash,
				fromHash: filter.fromHash,
			};
		default:
			return { kind: "against-base", baseBranch };
	}
}
