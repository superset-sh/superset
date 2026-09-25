import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceConnectionRefresh } from "../useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

type GetAllClient = ReturnType<
	typeof getHostServiceClientByUrl
>["pageWatch"]["getAll"];
type PageWatchers = Awaited<ReturnType<GetAllClient["query"]>>;
type PageWatcher = PageWatchers[number];

function getPageWatchersQueryKey(workspaceId: string) {
	return ["page-watchers", workspaceId] as const;
}

export function usePageWatchers(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, PageWatcher> {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
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
		queryFn: async ({ signal }) => {
			if (!hostUrl) return [] as PageWatchers;
			return await getHostServiceClientByUrl(hostUrl).pageWatch.getAll.query(
				{
					workspaceId,
				},
				{ signal },
			);
		},
	});

	const invalidate = useWorkspaceConnectionRefresh(
		workspaceId,
		queryKey,
		enabled,
	);
	useWorkspaceEvent("page-watch:changed", workspaceId, invalidate, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidate, enabled);

	return useMemo(() => {
		const map = new Map<string, PageWatcher>();
		for (const watcher of query.data ?? []) map.set(watcher.pageId, watcher);
		return map;
	}, [query.data]);
}
