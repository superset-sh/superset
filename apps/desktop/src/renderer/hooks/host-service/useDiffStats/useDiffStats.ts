import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface DiffStats {
	additions: number;
	deletions: number;
}

export function useDiffStats(workspaceId: string): DiffStats | null {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["diff-stats", hostUrl, workspaceId] as const,
		[hostUrl, workspaceId],
	);

	const { data: status } = useQuery({
		queryKey,
		enabled: Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).git.getStatus.query({
				workspaceId,
			});
		},
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("git:changed", workspaceId, invalidate);

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
