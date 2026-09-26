import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

const REFRESH_MS = 30_000;

export interface PageWatcherRow {
	workspaceId: string;
	workspaceName: string | null;
	terminalId: string;
	agentId: string | null;
	sessionTitle: string | null;
	hostId: string;
	hostUrl: string;
}

export function getHostPageWatchersQueryKey(hostUrl: string) {
	return ["page-watchers-by-host", hostUrl] as const;
}

interface HostTarget {
	hostId: string;
	hostUrl: string;
}

/**
 * Every agent watching `pageId`, across the hosts this machine can already
 * reach, with the workspace each one sits in.
 *
 * A host's in-memory list is the watch truth, so a host that answers is
 * reporting live state — there is nothing to age out and no heartbeat to
 * read. The cost is that a watcher on a host we cannot reach is not in here;
 * the page's org-wide watch flag still says one exists, and the menu says so.
 */
export function usePageWatchersForPage({
	pageId,
	workspaceId,
}: {
	pageId: string | undefined;
	workspaceId: string;
}): PageWatcherRow[] {
	const { workspaces, cache } = useHostWorkspaces();
	const queryClient = useQueryClient();
	const cloudUtils = cloudTrpc.useUtils();

	const currentHostId = useMemo(
		() => workspaces.find((workspace) => workspace.id === workspaceId)?.hostId,
		[workspaces, workspaceId],
	);

	// A sandbox counts every request as activity, so polling one in the
	// background would hold a cloud workspace's VM awake for as long as the app
	// is open. Only the sandbox already on screen is asked.
	const targets = useMemo<HostTarget[]>(() => {
		const seen = new Map<string, HostTarget>();
		for (const workspace of workspaces) {
			const hostId = workspace.hostId;
			if (seen.has(hostId)) continue;
			if (cache.isSandboxHost(hostId) && hostId !== currentHostId) continue;
			const hostUrl = cache.resolveHostUrl(hostId);
			if (!hostUrl) continue;
			seen.set(hostId, { hostId, hostUrl });
		}
		return [...seen.values()];
	}, [workspaces, cache, currentHostId]);

	const results = useQueries({
		queries: targets.map((target) => ({
			queryKey: getHostPageWatchersQueryKey(target.hostUrl),
			enabled: Boolean(pageId),
			staleTime: REFRESH_MS,
			refetchInterval: REFRESH_MS,
			queryFn: async () =>
				await getHostServiceClientByUrl(target.hostUrl).pageWatch.getAll.query(
					{},
				),
		})),
	});

	useWorkspaceEvent(
		"page-watch:changed",
		workspaceId,
		useCallback(() => {
			void queryClient.invalidateQueries({
				queryKey: ["page-watchers-by-host"],
			});
			if (pageId) void cloudUtils.page.get.invalidate({ id: pageId });
		}, [queryClient, cloudUtils, pageId]),
	);

	const names = useMemo(
		() =>
			new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
		[workspaces],
	);

	return useMemo(() => {
		if (!pageId) return [];
		const rows: PageWatcherRow[] = [];
		for (const [index, result] of results.entries()) {
			const target = targets[index];
			if (!target) continue;
			for (const watcher of result.data ?? []) {
				if (watcher.pageId !== pageId) continue;
				rows.push({
					workspaceId: watcher.workspaceId,
					workspaceName: names.get(watcher.workspaceId) ?? null,
					terminalId: watcher.terminalId,
					agentId: watcher.agentId,
					sessionTitle: watcher.sessionTitle,
					hostId: target.hostId,
					hostUrl: target.hostUrl,
				});
			}
		}
		return rows;
	}, [results, targets, names, pageId]);
}
