import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface DiffStats {
	additions: number;
	deletions: number;
}

interface UseDiffStatsOptions {
	enabled?: boolean;
}

export function useDiffStats(
	workspaceId: string,
	options: UseDiffStatsOptions = {},
): DiffStats | null {
	const { enabled = true } = options;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["diff-stats", hostUrl, workspaceId] as const,
		[hostUrl, workspaceId],
	);

	const { data: stats } = useQuery({
		queryKey,
		enabled: enabled && Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).git.getDiffStats.query({
				workspaceId,
			});
		},
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	useWorkspaceEvent("git:changed", workspaceId, invalidate, enabled);

	return stats ?? null;
}
