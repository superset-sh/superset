import { useMemo } from "react";
import { CgSpinner } from "react-icons/cg";
import { HiDocumentMagnifyingGlass } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useCommitRange, useDiffMode } from "renderer/stores";
import { AllDiffsViewer } from "./components/AllDiffsViewer";

export function ChangesContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: workspaceGroups } = trpc.workspaces.getAllGrouped.useQuery();

	// Diff store state
	const mode = useDiffMode();
	const commitRange = useCommitRange();

	// Get worktree path from active workspace
	const worktreePath = useMemo(() => {
		if (!activeWorkspace || !workspaceGroups) return null;
		for (const group of workspaceGroups) {
			const ws = group.workspaces.find((w) => w.id === activeWorkspace.id);
			if (ws) return ws.worktreePath;
		}
		return null;
	}, [activeWorkspace, workspaceGroups]);

	// Query for all diffs
	const {
		data: allDiffs,
		isLoading,
		error,
	} = trpc.diff.getAllDiffs.useQuery(
		{
			worktreePath: worktreePath!,
			mode: mode,
			range: commitRange || undefined,
		},
		{
			enabled: !!worktreePath,
		},
	);

	// Loading state
	if (isLoading) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<div className="h-full w-full flex items-center justify-center">
					<div className="flex items-center gap-2 text-muted-foreground">
						<CgSpinner className="size-5 animate-spin" />
						<span className="text-sm">Loading diffs...</span>
					</div>
				</div>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<div className="h-full w-full flex items-center justify-center">
					<div className="text-center text-destructive">
						<p className="text-sm">Failed to load diffs</p>
						<p className="text-xs mt-1 opacity-70">{error.message}</p>
					</div>
				</div>
			</div>
		);
	}

	// No changes
	if (!allDiffs || allDiffs.length === 0) {
		return (
			<div className="flex-1 h-full overflow-auto bg-background">
				<div className="h-full w-full flex items-center justify-center">
					<div className="text-center text-muted-foreground">
						<HiDocumentMagnifyingGlass className="size-12 mx-auto mb-4 opacity-50" />
						<p className="text-sm">No changes to display</p>
					</div>
				</div>
			</div>
		);
	}

	return <AllDiffsViewer diffs={allDiffs} />;
}
