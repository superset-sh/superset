import { ScrollArea } from "@superset/ui/scroll-area";
import { useEffect, useMemo } from "react";
import { CgSpinner } from "react-icons/cg";
import { HiCheckCircle } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import {
	useCommitRange,
	useDiffMode,
	useExpandAllFolders,
	useExpandedFolders,
	useScrollToFile,
	useSetCommitRange,
	useSetDiffMode,
	useToggleFolder,
} from "renderer/stores";
import { DiffModeSelector } from "./components/DiffModeSelector";
import { FileTree } from "./components/FileTree";
import { getAllFolderPaths, useFileTree } from "./hooks/useFileTree";

export function ChangesView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: workspaceGroups } = trpc.workspaces.getAllGrouped.useQuery();

	// Diff store state
	const mode = useDiffMode();
	const setMode = useSetDiffMode();
	const commitRange = useCommitRange();
	const setCommitRange = useSetCommitRange();
	const scrollToFile = useScrollToFile();
	const expandedFolders = useExpandedFolders();
	const toggleFolder = useToggleFolder();
	const expandAllFolders = useExpandAllFolders();

	// Get worktree path from active workspace
	const worktreePath = useMemo(() => {
		if (!activeWorkspace || !workspaceGroups) return null;
		for (const group of workspaceGroups) {
			const ws = group.workspaces.find((w) => w.id === activeWorkspace.id);
			if (ws) return ws.worktreePath;
		}
		return null;
	}, [activeWorkspace, workspaceGroups]);

	// Query for changed files
	const {
		data: changedFiles,
		isLoading: isLoadingFiles,
		error: filesError,
	} = trpc.diff.getChangedFiles.useQuery(
		{
			worktreePath: worktreePath!,
			mode: mode,
			range: commitRange || undefined,
		},
		{
			enabled: !!worktreePath,
			refetchInterval: 5000, // Poll every 5 seconds for changes
		},
	);

	// Query for commit history (for range dropdown)
	const { data: commits, isLoading: isLoadingCommits } =
		trpc.diff.getCommitHistory.useQuery(
			{
				worktreePath: worktreePath!,
				limit: 20,
			},
			{
				enabled: !!worktreePath,
			},
		);

	// Query for parent branch
	const { data: parentBranch } = trpc.diff.getParentBranch.useQuery(
		{
			worktreePath: worktreePath!,
		},
		{
			enabled: !!worktreePath,
		},
	);

	// Build file tree for getting all folder paths
	const fileTree = useFileTree(changedFiles || []);

	// Auto-expand all folders when files change
	useEffect(() => {
		if (changedFiles && changedFiles.length > 0) {
			const allPaths = getAllFolderPaths(fileTree);
			expandAllFolders(allPaths);
		}
	}, [changedFiles, fileTree, expandAllFolders]);

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-sidebar-foreground/60 text-sm p-4">
				No workspace selected
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Mode selector */}
			<div className="p-2 border-b border-border">
				<DiffModeSelector
					mode={mode}
					onModeChange={setMode}
					commitRange={commitRange}
					onCommitRangeChange={setCommitRange}
					commits={commits || []}
					isLoadingCommits={isLoadingCommits}
					parentBranch={parentBranch || null}
				/>
			</div>

			{/* File list */}
			<ScrollArea className="flex-1">
				<div className="p-2">
					{isLoadingFiles ? (
						<div className="flex items-center justify-center py-8 text-muted-foreground">
							<CgSpinner className="size-5 animate-spin mr-2" />
							<span className="text-sm">Loading changes...</span>
						</div>
					) : filesError ? (
						<div className="flex items-center justify-center py-8 text-destructive text-sm">
							Failed to load changes
						</div>
					) : !changedFiles || changedFiles.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<HiCheckCircle className="size-8 mb-2 text-green-500" />
							<span className="text-sm">No changes</span>
							<span className="text-xs mt-1">
								{mode === "unstaged"
									? "Working directory is clean"
									: mode === "all-changes"
										? "No changes from parent branch"
										: "No changes in selected range"}
							</span>
						</div>
					) : (
						<FileTree
							files={changedFiles}
							onFileClick={scrollToFile}
							expandedFolders={expandedFolders}
							onToggleFolder={toggleFolder}
						/>
					)}
				</div>
			</ScrollArea>

			{/* Summary footer */}
			{changedFiles && changedFiles.length > 0 && (
				<div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
					{changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""}{" "}
					changed
				</div>
			)}
		</div>
	);
}
