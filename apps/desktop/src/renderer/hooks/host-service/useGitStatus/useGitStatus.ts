import {
	type GitChangedPayload,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { createTrailingRefreshScheduler } from "./createTrailingRefreshScheduler";

const GIT_STATUS_STALE_TIME_MS = 5_000;
// Status snapshots scale with changed-file count, so keep revisits warm without
// retaining large inactive workspaces for the global 30-minute default.
export const GIT_STATUS_GC_TIME_MS = 10 * 60_000;

/**
 * Fetches workspace git status and keeps it live against server events.
 *
 * Single owner of the `git.getStatus` query + `git:changed` subscription for
 * a workspace. Consumers (Changes tab UI, file tree decoration, anything
 * else) receive the query result as data and do not re-fetch.
 *
 * `git:changed` is already debounced server-side in `GitWatcher` and covers
 * both `.git/` metadata writes and worktree file edits.
 */
export function useGitStatus(workspaceId: string, enabled = true) {
	const utils = workspaceTrpc.useUtils();

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{
			staleTime: Number.POSITIVE_INFINITY,
			enabled: enabled && Boolean(workspaceId),
		},
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const query = workspaceTrpc.git.getStatus.useQuery(
		{
			workspaceId,
			baseBranch: baseBranch ?? undefined,
			priority: "foreground",
		},
		{
			enabled: enabled && Boolean(workspaceId),
			gcTime: GIT_STATUS_GC_TIME_MS,
			refetchOnWindowFocus: true,
			staleTime: GIT_STATUS_STALE_TIME_MS,
		},
	);
	const refreshScheduler = useMemo(
		() =>
			createTrailingRefreshScheduler(() => {
				if (!workspaceId) return Promise.resolve();
				return query.refetch({ cancelRefetch: false });
			}),
		[query.refetch, workspaceId],
	);

	useEffect(
		() => () => {
			refreshScheduler.dispose();
		},
		[refreshScheduler],
	);

	const invalidate = useCallback(
		(payload?: GitChangedPayload) => {
			void refreshScheduler.request();
			if (payload?.paths && payload.paths.length > 0) {
				for (const path of payload.paths) {
					void utils.git.getDiff.invalidate({ workspaceId, path });
				}
			} else {
				void utils.git.getDiff.invalidate({ workspaceId });
				// Current branch may have changed (external checkout), and
				// branch.<name>.base is per-branch — drop the cache so the next read
				// picks up the new branch's base.
				void utils.git.getBaseBranch.invalidate({ workspaceId });
			}
		},
		[refreshScheduler, utils, workspaceId],
	);

	useWorkspaceEvent("git:changed", workspaceId, invalidate, enabled);

	return query;
}
