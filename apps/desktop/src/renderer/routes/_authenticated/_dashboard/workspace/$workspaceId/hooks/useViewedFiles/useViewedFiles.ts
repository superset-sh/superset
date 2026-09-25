import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface ViewedFilesApi {
	viewedSet: Set<string>;
	setViewed: (path: string, next: boolean) => void;
}

export function useViewedFiles(workspaceId: string): ViewedFilesApi {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.workspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const viewedFiles = rows[0]?.viewedFiles ?? [];
	const viewedSet = useMemo(() => new Set(viewedFiles), [viewedFiles]);

	const setViewed = useCallback(
		(path: string, next: boolean) => {
			if (!collections.workspaceLocalState.get(workspaceId)) return;
			collections.workspaceLocalState.update(workspaceId, (draft) => {
				const current = draft.viewedFiles ?? [];
				const has = current.includes(path);
				if (next && !has) {
					draft.viewedFiles = [...current, path];
				} else if (!next && has) {
					draft.viewedFiles = current.filter((p) => p !== path);
				}
			});
		},
		[collections, workspaceId],
	);

	return { viewedSet, setViewed };
}
