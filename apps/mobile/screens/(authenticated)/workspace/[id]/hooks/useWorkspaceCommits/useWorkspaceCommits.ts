import { useQuery } from "@tanstack/react-query";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

const COMMITS_STALE_MS = 30_000;

export function getWorkspaceCommitsQueryKey(workspaceId: string | null) {
	return ["workspace-commits", workspaceId] as const;
}

/** Commits on the workspace branch (base..HEAD) via host `git.listCommits`. */
export function useWorkspaceCommits(workspaceId: string | null) {
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null;

	const query = useQuery({
		queryKey: getWorkspaceCommitsQueryKey(workspaceId),
		enabled: hostUrl !== null && workspaceId !== null,
		staleTime: COMMITS_STALE_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () => {
			if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
			return getHostServiceClientByUrl(hostUrl).git.listCommits.query({
				workspaceId,
			});
		},
	});

	return {
		commits: query.data?.commits ?? [],
		hostUrl,
		isReady: hostUrl === null || query.isSuccess || query.isError,
	};
}
