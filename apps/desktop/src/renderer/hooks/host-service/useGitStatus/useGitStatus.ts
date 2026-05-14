import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useRef } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

// `git.getStatus` spawns ~8 child `git` processes per call. If a burst of
// `git:changed` events fires back-to-back (e.g. a rebase, a bulk save, a
// build that writes many tracked files) we want one refetch, not seven —
// concurrent runs against the same worktree thrash on `.git/index.lock`
// and starve disk I/O, turning a ~700ms query into 5–7s.
const INVALIDATE_DEBOUNCE_MS = 250;

/**
 * Fetches workspace git status and keeps it live against server events.
 *
 * Single owner of the `git.getStatus` query + `git:changed` subscription for
 * a workspace. Consumers (Changes tab UI, file tree decoration, anything
 * else) receive the query result as data and do not re-fetch.
 */
export function useGitStatus(workspaceId: string) {
	const utils = workspaceTrpc.useUtils();

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY, enabled: Boolean(workspaceId) },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const query = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{
			refetchOnWindowFocus: true,
			enabled: Boolean(workspaceId),
			staleTime: 750,
		},
	);

	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const invalidate = useCallback(() => {
		if (debounceTimer.current) clearTimeout(debounceTimer.current);
		debounceTimer.current = setTimeout(() => {
			debounceTimer.current = null;
			// Cancel any in-flight refetch so we never stack parallel git runs
			// against the same worktree.
			void utils.git.getStatus.cancel({ workspaceId });
			void utils.git.getStatus.invalidate({ workspaceId });
			// Current branch may have changed (external checkout), and
			// branch.<name>.base is per-branch — drop the cache so the next read
			// picks up the new branch's base.
			void utils.git.getBaseBranch.invalidate({ workspaceId });
		}, INVALIDATE_DEBOUNCE_MS);
	}, [utils, workspaceId]);

	useEffect(
		() => () => {
			if (debounceTimer.current) clearTimeout(debounceTimer.current);
		},
		[],
	);

	useWorkspaceEvent("git:changed", workspaceId, invalidate);

	return query;
}
