import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export interface ViewedFilesApi {
	viewedFiles: string[];
	viewedSet: Set<string>;
	isViewed: (path: string) => boolean;
	setViewed: (path: string, next: boolean) => void;
	toggleViewed: (path: string) => void;
}

export function useViewedFiles(workspaceId: string): ViewedFilesApi {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const viewedFiles = rows[0]?.viewedFiles ?? [];
	const viewedSet = useMemo(() => new Set(viewedFiles), [viewedFiles]);

	const setViewed = useCallback(
		(path: string, next: boolean) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
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

	const isViewed = useCallback(
		(path: string) => viewedSet.has(path),
		[viewedSet],
	);
	const toggleViewed = useCallback(
		(path: string) => setViewed(path, !viewedSet.has(path)),
		[setViewed, viewedSet],
	);

	return { viewedFiles, viewedSet, isViewed, setViewed, toggleViewed };
}
