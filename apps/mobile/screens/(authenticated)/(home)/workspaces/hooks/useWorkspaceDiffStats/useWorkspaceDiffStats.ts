import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	type GitStatusSnapshot,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export interface DiffStats {
	additions: number;
	deletions: number;
}

const DIFF_STATS_STALE_MS = 60_000;
const DIFF_STATS_GC_MS = 30 * 60_000;

function aggregateDiffStats(status: GitStatusSnapshot): DiffStats {
	const byPath = new Map<string, { additions: number; deletions: number }>();
	for (const file of [
		...status.againstBase,
		...status.staged,
		...status.unstaged,
	]) {
		byPath.set(file.path, file);
	}
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions;
		deletions += file.deletions;
	}
	return { additions, deletions };
}

const MAX_DIFF_STAT_ROWS = 30;

/**
 * Live working-tree diff stats for the top rows of the sorted list (they're
 * what's on or near screen with recency sorting). The returned map is built
 * from the whole query cache so rows keep their last-known stats.
 */
export function useWorkspaceDiffStats({
	workspaces,
	resolveHostUrl,
}: {
	/** Sorted rows currently rendered by the list. */
	workspaces: HostWorkspaceItem[];
	resolveHostUrl: (hostId: string) => string | null;
}): Map<string, DiffStats> {
	const queryClient = useQueryClient();

	const eligible = useMemo(() => {
		const result: Array<{ workspaceId: string; hostUrl: string }> = [];
		for (const workspace of workspaces.slice(0, MAX_DIFF_STAT_ROWS)) {
			if (!workspace.hostReachable || workspace.worktreeExists === false) {
				continue;
			}
			const hostUrl = resolveHostUrl(workspace.hostId);
			if (hostUrl) result.push({ workspaceId: workspace.id, hostUrl });
		}
		return result;
	}, [workspaces, resolveHostUrl]);

	const _queries = useQueries({
		queries: eligible.map(({ workspaceId, hostUrl }) => ({
			queryKey: ["diff-stats", hostUrl, workspaceId] as const,
			staleTime: DIFF_STATS_STALE_MS,
			gcTime: DIFF_STATS_GC_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () =>
				getHostServiceClientByUrl(hostUrl).git.getStatus.query({
					workspaceId,
					priority: "background",
				}),
		})),
	});

	return useMemo(() => {
		const map = new Map<string, DiffStats>();
		for (const [
			queryKey,
			status,
		] of queryClient.getQueriesData<GitStatusSnapshot>({
			queryKey: ["diff-stats"],
		})) {
			const workspaceId = queryKey[2];
			if (typeof workspaceId === "string" && status) {
				map.set(workspaceId, aggregateDiffStats(status));
			}
		}
		return map;
	}, [queryClient]);
}
