import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useMemo } from "react";
import { useSelectedRepoStore } from "../../state/selectedRepoStore";
import { resolveSelectedRepo } from "./resolveSelectedRepo";

export type WorkspaceRepo =
	inferRouterOutputs<AppRouter>["workspace"]["get"]["repos"][number];

const PRIMARY_REPO_ARG: { repo?: string } = {};

const NO_REPOS: WorkspaceRepo[] = [];

const WORKSPACE_REPOS_STALE_TIME_MS = 30_000;

export interface UseWorkspaceReposResult {
	repos: WorkspaceRepo[];
	selected: WorkspaceRepo | undefined;
	hasMultipleRepos: boolean;
	/** Absolute path of the selected checkout, not the multi-repo container. */
	rootPath: string;
	repoArg: { repo?: string };
	selectFolder: (folder: string) => void;
	isLoading: boolean;
}

/**
 * The workspace's checkouts plus which one the UI is scoped to. Shares
 * `workspace.get` with the route, so the dozen call sites cost one request.
 */
export function useWorkspaceRepos(
	workspaceId: string,
): UseWorkspaceReposResult {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ staleTime: WORKSPACE_REPOS_STALE_TIME_MS, enabled: Boolean(workspaceId) },
	);
	const storedFolder = useSelectedRepoStore(
		(state) => state.folders[workspaceId],
	);
	const selectFolderInStore = useSelectedRepoStore(
		(state) => state.selectFolder,
	);

	const repos = workspaceQuery.data?.repos ?? NO_REPOS;
	const selected = resolveSelectedRepo(repos, storedFolder);
	const hasMultipleRepos = repos.length > 1;

	const selectFolder = useCallback(
		(folder: string) => selectFolderInStore(workspaceId, folder),
		[selectFolderInStore, workspaceId],
	);

	// Stable per folder so the query inputs and callbacks that spread it
	// don't change identity on every render.
	const selectedFolder = hasMultipleRepos ? selected?.folder : undefined;
	const repoArg = useMemo(
		() => (selectedFolder ? { repo: selectedFolder } : PRIMARY_REPO_ARG),
		[selectedFolder],
	);

	return {
		repos,
		selected,
		hasMultipleRepos,
		rootPath:
			hasMultipleRepos && selected
				? selected.path
				: (workspaceQuery.data?.worktreePath ?? ""),
		repoArg,
		selectFolder,
		isLoading: workspaceQuery.isLoading,
	};
}
