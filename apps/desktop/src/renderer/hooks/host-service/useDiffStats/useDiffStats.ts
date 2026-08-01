import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface DiffStats {
	additions: number;
	deletions: number;
}

export function useDiffStats(
	workspaceId: string,
	options?: { enabled?: boolean },
): DiffStats | null {
	const enabled = options?.enabled ?? true;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["diff-stats", hostUrl, workspaceId] as const,
		[hostUrl, workspaceId],
	);

	const { data: status } = useQuery({
		queryKey,
		enabled: enabled && Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).git.getStatus.query({
				workspaceId,
				priority: "background",
			});
		},
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	// Stays subscribed while disabled: invalidation marks the cached stats
	// stale so they refetch when the query is re-enabled (staleTime is
	// Infinity, so a gated subscription would freeze counts).
	useWorkspaceEvent(
		"git:changed",
		workspaceId,
		invalidate,
		Boolean(workspaceId) && Boolean(hostUrl),
	);

	return useMemo<DiffStats | null>(() => {
		if (!status) return null;

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
