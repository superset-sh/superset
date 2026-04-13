import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
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

	const filterKind = filter.kind;
	const commitHash =
		filter.kind === "commit"
			? filter.hash
			: filter.kind === "range"
				? filter.toHash
				: null;
	const fromHash = filter.kind === "range" ? filter.fromHash : null;

	return useMemo<DiffRef>(() => {
		switch (filterKind) {
			case "uncommitted":
				return { kind: "uncommitted" };
			case "commit":
				return { kind: "commit", commitHash: commitHash ?? "" };
			case "range":
				return {
					kind: "commit",
					commitHash: commitHash ?? "",
					fromHash: fromHash ?? undefined,
				};
			default:
				return { kind: "against-base", baseBranch };
		}
	}, [filterKind, commitHash, fromHash, baseBranch]);
}
