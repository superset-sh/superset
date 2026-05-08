import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

const STATUS_REFETCH_INTERVAL_MS = 2_500;
const LARGE_CHANGESET_REFETCH_INTERVAL_MS = 10_000;
const LARGE_CHANGESET_THRESHOLD = 200;
const STATUS_QUERY_STALE_TIME_MS = 2_000;

/**
 * Fetches workspace git status and keeps it live against server events.
 *
 * Single owner of the `git.getStatus` query + `git:changed` subscription for
 * a workspace. Consumers (Changes tab UI, file tree decoration, anything
 * else) receive the query result as data and do not re-fetch.
 *
 * `git:changed` is already debounced server-side in `GitWatcher` and covers
 * both `.git/` metadata writes and worktree file edits — no client-side
 * debounce needed. The polling `refetchInterval` is a safety net for missed
 * events (suspend/resume, FS watcher edge cases) and backs off on large
 * changesets to avoid sustained git overhead.
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
			enabled: Boolean(workspaceId),
			refetchOnWindowFocus: true,
			staleTime: STATUS_QUERY_STALE_TIME_MS,
			refetchInterval: (query) => {
				const data = query.state.data;
				if (!data) return STATUS_REFETCH_INTERVAL_MS;
				const total =
					data.againstBase.length + data.staged.length + data.unstaged.length;
				return total >= LARGE_CHANGESET_THRESHOLD
					? LARGE_CHANGESET_REFETCH_INTERVAL_MS
					: STATUS_REFETCH_INTERVAL_MS;
			},
		},
	);

	const invalidate = useCallback(() => {
		void utils.git.getStatus.invalidate({ workspaceId });
		// Current branch may have changed (external checkout), and
		// branch.<name>.base is per-branch — drop the cache so the next read
		// picks up the new branch's base.
		void utils.git.getBaseBranch.invalidate({ workspaceId });
	}, [utils, workspaceId]);

	useWorkspaceEvent("git:changed", workspaceId, invalidate);

	return query;
}
