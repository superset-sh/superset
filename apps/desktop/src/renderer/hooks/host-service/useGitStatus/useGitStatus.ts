import {
	type GitChangedPayload,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

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
		{ refetchOnWindowFocus: true, enabled: enabled && Boolean(workspaceId) },
	);

	const invalidate = useCallback(
		(payload?: GitChangedPayload) => {
			void utils.git.getStatus.invalidate({ workspaceId });
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
		[utils, workspaceId],
	);

	useWorkspaceEvent("git:changed", workspaceId, invalidate, enabled);

	return query;
}
