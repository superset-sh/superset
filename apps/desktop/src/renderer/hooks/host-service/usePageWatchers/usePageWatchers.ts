import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

type GetAllClient = ReturnType<
	typeof getHostServiceClientByUrl
>["pageWatch"]["getAll"];
type PageWatchers = Awaited<ReturnType<GetAllClient["query"]>>;
export type PageWatcher = PageWatchers[number];

export function getPageWatchersQueryKey(workspaceId: string) {
	return ["page-watchers", workspaceId] as const;
}

export function usePageWatchers(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, PageWatcher> {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => getPageWatchersQueryKey(workspaceId),
		[workspaceId],
	);

	const enabled =
		(options?.enabled ?? true) && Boolean(workspaceId) && Boolean(hostUrl);

	const query = useQuery({
		queryKey,
		enabled,
		staleTime: 30_000,
		queryFn: async () => {
			if (!hostUrl) return [] as PageWatchers;
			return await getHostServiceClientByUrl(hostUrl).pageWatch.getAll.query({
				workspaceId,
			});
		},
	});

	useWorkspaceEvent(
		"page-watch:changed",
		workspaceId,
		useCallback(() => {
			void queryClient.invalidateQueries({ queryKey });
		}, [queryClient, queryKey]),
	);

	useWorkspaceEvent(
		"terminal:lifecycle",
		workspaceId,
		useCallback(() => {
			void queryClient.invalidateQueries({ queryKey });
		}, [queryClient, queryKey]),
	);

	return useMemo(() => {
		const map = new Map<string, PageWatcher>();
		for (const watcher of query.data ?? []) map.set(watcher.pageId, watcher);
		return map;
	}, [query.data]);
}
