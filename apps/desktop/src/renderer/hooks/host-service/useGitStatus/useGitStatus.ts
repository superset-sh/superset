import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

/**
 * Fetches workspace git status and keeps it live against server events.
 *
 * Single owner of the `git.getStatus` query + `git:changed` subscription for
 * a workspace. Consumers (Changes tab UI, file tree decoration, anything
 * else) receive the query result as data and do not re-fetch.
 *
 * `git:changed` is already debounced server-side in `GitWatcher` and covers
 * both `.git/` metadata writes and worktree file edits — no client-side
 * debounce needed.
 */
export function useGitStatus(workspaceId: string) {
	const collections = useCollections();
	const baseBranch: string | null =
		collections.v2WorkspaceLocalState.get(workspaceId)?.sidebarState
			?.baseBranch ?? null;

	const utils = workspaceTrpc.useUtils();

	const query = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true, enabled: Boolean(workspaceId) },
	);

	const invalidate = useCallback(() => {
		void utils.git.getStatus.invalidate({ workspaceId });
	}, [utils, workspaceId]);

	useWorkspaceEvent("git:changed", workspaceId, invalidate);

	return query;
}
