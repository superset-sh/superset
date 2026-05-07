import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

export interface DiffStats {
	additions: number;
	deletions: number;
}

export interface UseDiffStatsOptions {
	/**
	 * Skip the underlying git.getStatus query when the consumer is not
	 * displaying diff stats (e.g. icon-only sidebar tiles). Defaults to true.
	 */
	enabled?: boolean;
}

interface DiffStatsQueryOptions {
	enabled: boolean;
	refetchOnWindowFocus: false;
}

/**
 * Resolves the React Query options used by `useDiffStats`. Exposed for
 * tests and so callers can reason about the gating contract.
 *
 * Each sidebar tile gets its own query key, so a single visible workspace
 * costs ~17 git subprocesses per refetch. Tiles that don't render the diff
 * count (icon-only collapsed sidebar) MUST pass `enabled: false` to avoid
 * fanning that work out per-workspace — see #4198.
 */
export function getDiffStatsQueryOptions(
	workspaceId: string,
	options: UseDiffStatsOptions = {},
): DiffStatsQueryOptions {
	return {
		enabled: Boolean(workspaceId) && options.enabled !== false,
		// Multiple sidebar tiles each have their own query key, so focus
		// refetch would re-fan out the very work this hook is supposed to
		// consolidate.
		refetchOnWindowFocus: false,
	};
}

/**
 * Diff stats for a single workspace, derived from the shared `git.getStatus`
 * query cache. Subscribes to `git:changed` and invalidates the query — React
 * Query collapses concurrent invalidations from sibling consumers (e.g.
 * `useGitStatus`, multiple sidebar tiles) into a single refetch.
 */
export function useDiffStats(
	workspaceId: string,
	options: UseDiffStatsOptions = {},
): DiffStats | null {
	const utils = workspaceTrpc.useUtils();
	const { data: status } = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId },
		getDiffStatsQueryOptions(workspaceId, options),
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
