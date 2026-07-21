import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	buildRelayHostUrl,
	type GitStatusSnapshot,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export type ChangesetSource = "against-base" | "staged" | "unstaged";

type StatusFile = GitStatusSnapshot["againstBase"][number];

export interface ChangesetFile extends StatusFile {
	source: ChangesetSource;
}

export interface WorkspaceChangesetResult {
	files: ChangesetFile[];
	additions: number;
	deletions: number;
	currentBranch: string | null;
	baseBranch: string | null;
	hostUrl: string | null;
	/** Answered or failed (or no reachable host). Gates empty states only. */
	isReady: boolean;
	refetch: () => Promise<unknown>;
}

const CHANGESET_STALE_MS = 15_000;
const CHANGESET_REFETCH_MS = 30_000;

export function getWorkspaceChangesetQueryKey(workspaceId: string | null) {
	return ["workspace-changeset", workspaceId] as const;
}

/**
 * The workspace's working-tree changeset: one row per path (last write wins
 * across against-base → staged → unstaged, matching useVisibleDiffStats so
 * totals agree with the home diff chip), tagged with the source category
 * that `git.getDiff` expects.
 */
export function useWorkspaceChangeset(
	workspaceId: string | null,
): WorkspaceChangesetResult {
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? buildRelayHostUrl(host.organizationId, host.machineId)
			: null;

	const query = useQuery({
		queryKey: getWorkspaceChangesetQueryKey(workspaceId),
		enabled: hostUrl !== null && workspaceId !== null,
		staleTime: CHANGESET_STALE_MS,
		refetchInterval: CHANGESET_REFETCH_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () => {
			if (!hostUrl || !workspaceId) throw new Error("Host is not resolved");
			return getHostServiceClientByUrl(hostUrl).git.getStatus.query({
				workspaceId,
				priority: "foreground",
			});
		},
	});

	const { files, additions, deletions } = useMemo(() => {
		const status = query.data;
		const byPath = new Map<string, ChangesetFile>();
		if (status) {
			const groups: Array<[ChangesetSource, StatusFile[]]> = [
				["against-base", status.againstBase],
				["staged", status.staged],
				["unstaged", status.unstaged],
			];
			for (const [source, groupFiles] of groups) {
				for (const file of groupFiles) {
					byPath.set(file.path, { ...file, source });
				}
			}
		}
		const rows = [...byPath.values()].sort((a, b) =>
			a.path.localeCompare(b.path),
		);
		let added = 0;
		let deleted = 0;
		for (const file of rows) {
			added += file.additions;
			deleted += file.deletions;
		}
		return { files: rows, additions: added, deletions: deleted };
	}, [query.data]);

	return {
		files,
		additions,
		deletions,
		currentBranch: query.data?.currentBranch?.name ?? null,
		baseBranch: query.data?.defaultBranch?.name ?? null,
		hostUrl,
		isReady: hostUrl === null || query.isSuccess || query.isError,
		refetch: query.refetch,
	};
}
