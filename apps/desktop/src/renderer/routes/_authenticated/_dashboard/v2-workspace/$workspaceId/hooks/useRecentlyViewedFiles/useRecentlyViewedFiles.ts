import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { RECENT_STORE_LIMIT } from "./constants";

export interface RecentFile {
	relativePath: string;
	absolutePath: string;
	lastAccessedAt: number;
}

interface RecentFileInput {
	relativePath: string;
	absolutePath: string;
}

export interface RecentlyViewedFilesApi {
	recentFiles: RecentFile[];
	recordView: (file: RecentFileInput) => void;
}

export function useRecentlyViewedFiles(
	workspaceId: string,
): RecentlyViewedFilesApi {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const recentFiles = useMemo(() => rows[0]?.recentlyViewedFiles ?? [], [rows]);

	const recordView = useCallback(
		(file: RecentFileInput) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				const current = draft.recentlyViewedFiles ?? [];
				const withoutDup = current.filter(
					(f) => f.relativePath !== file.relativePath,
				);
				draft.recentlyViewedFiles = [
					{
						relativePath: file.relativePath,
						absolutePath: file.absolutePath,
						lastAccessedAt: Date.now(),
					},
					...withoutDup,
				].slice(0, RECENT_STORE_LIMIT);
			});
		},
		[collections, workspaceId],
	);

	return { recentFiles, recordView };
}
