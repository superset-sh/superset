import { useQueries } from "@tanstack/react-query";
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

/**
 * Live working-tree diff stats for the workspaces currently settled in the
 * viewport — bounded per screenful, not per project.
 */
export function useVisibleDiffStats({
	visibleIds,
	workspacesById,
	resolveHostUrl,
}: {
	visibleIds: string[];
	workspacesById: Map<string, HostWorkspaceItem>;
	resolveHostUrl: (hostId: string) => string | null;
}): Map<string, DiffStats> {
	const eligible = useMemo(() => {
		const result: Array<{ workspaceId: string; hostUrl: string }> = [];
		for (const workspaceId of visibleIds) {
			const workspace = workspacesById.get(workspaceId);
			if (
				!workspace ||
				workspace.source !== "host" ||
				!workspace.hostReachable ||
				workspace.worktreeExists === false
			) {
				continue;
			}
			const hostUrl = resolveHostUrl(workspace.hostId);
			if (hostUrl) result.push({ workspaceId, hostUrl });
		}
		return result;
	}, [visibleIds, workspacesById, resolveHostUrl]);

	const queries = useQueries({
		queries: eligible.map(({ workspaceId, hostUrl }) => ({
			queryKey: ["diff-stats", hostUrl, workspaceId] as const,
			staleTime: DIFF_STATS_STALE_MS,
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
		eligible.forEach(({ workspaceId }, index) => {
			const status = queries[index]?.data;
			if (status) map.set(workspaceId, aggregateDiffStats(status));
		});
		return map;
	}, [eligible, queries]);
}
