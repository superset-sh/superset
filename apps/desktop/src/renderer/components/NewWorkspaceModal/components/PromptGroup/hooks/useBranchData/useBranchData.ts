import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveOpenableWorktrees } from "../../utils/resolveOpenableWorktrees";

export function useBranchData(projectId: string | null) {
	const {
		data: localBranchData,
		isLoading: isLocalBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	// Show local data immediately (fast, no network), upgrade to remote when available
	const branchData = remoteBranchData ?? localBranchData;
	// Only show loading while waiting for the fast local query
	const isBranchesLoading = isLocalBranchesLoading && !branchData;

	const { data: externalWorktrees = [] } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const { data: trackedWorktrees = [] } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const worktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) set.add(wt.branch);
		for (const wt of trackedWorktrees) set.add(wt.branch);
		return set;
	}, [externalWorktrees, trackedWorktrees]);

	// Fetch active workspaces for this project
	const { data: activeWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const activeWorkspacesByBranch = useMemo(() => {
		const map = new Map<string, string>(); // branch → workspaceId
		for (const ws of activeWorkspaces) {
			if (ws.projectId === projectId && !ws.deletingAt) {
				map.set(ws.branch, ws.id);
			}
		}
		return map;
	}, [activeWorkspaces, projectId]);

	// Resolve openable worktrees (no active workspace)
	const openableWorktrees = useMemo(
		() => resolveOpenableWorktrees(trackedWorktrees, externalWorktrees),
		[trackedWorktrees, externalWorktrees],
	);

	// Map external worktree paths for badge display
	const externalWorktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) {
			set.add(wt.branch);
		}
		return set;
	}, [externalWorktrees]);

	return {
		branchData,
		isBranchesLoading,
		isBranchesError,
		worktreeBranches,
		activeWorkspacesByBranch,
		openableWorktrees,
		externalWorktreeBranches,
		trackedWorktrees,
		externalWorktrees,
	};
}
