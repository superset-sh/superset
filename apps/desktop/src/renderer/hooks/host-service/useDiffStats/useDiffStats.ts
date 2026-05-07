import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

export interface DiffStats {
	additions: number;
	deletions: number;
}

/**
 * Diff stats for a single workspace, derived from the shared `git.getStatus`
 * query cache. Subscribes to `git:changed` and invalidates the query — React
 * Query collapses concurrent invalidations from sibling consumers (e.g.
 * `useGitStatus`, multiple sidebar tiles) into a single refetch.
 */
export function useDiffStats(workspaceId: string): DiffStats | null {
	const utils = workspaceTrpc.useUtils();
	const { data: status } = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId },
		{
			enabled: Boolean(workspaceId),
			// Match the pre-RQ behavior: only update on `git:changed`, never
			// on focus. Multiple sidebar tiles each have their own query key,
			// so focus refetch would re-fan out the very work this hook is
			// supposed to consolidate.
			refetchOnWindowFocus: false,
		},
	);

	const invalidate = useCallback(() => {
		void utils.git.getStatus.invalidate({ workspaceId });
	}, [utils, workspaceId]);

	useWorkspaceEvent("git:changed", workspaceId, invalidate);

	return useMemo<DiffStats | null>(() => {
		if (!status) return null;

		// Deduplicate by path — a file can appear in multiple categories.
		const byPath = new Map<string, { additions: number; deletions: number }>();
		for (const file of status.againstBase) byPath.set(file.path, file);
		for (const file of status.staged) byPath.set(file.path, file);
		for (const file of status.unstaged) byPath.set(file.path, file);

		let additions = 0;
		let deletions = 0;
		for (const file of byPath.values()) {
			additions += file.additions;
			deletions += file.deletions;
		}
		return { additions, deletions };
	}, [status]);
}
