import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { memo, useCallback, useState } from "react";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { ChangesetFile } from "../../../../../../hooks/useChangeset";
import type { FoldSignal } from "../ChangesFileList";
import { ChangesFileList } from "../ChangesFileList";
import { ChangesHeader } from "../ChangesHeader";
import { ChangesToolbar } from "../ChangesToolbar";

type RouterOutputs = inferRouterOutputs<AppRouter>;

interface ChangesTabContentProps {
	workspaceId: string;
	status: {
		data: RouterOutputs["git"]["getStatus"] | undefined;
		isLoading: boolean;
	};
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	filter: ChangesFilter;
	viewMode: ChangesViewMode;
	baseBranch: string | null;
	files: ChangesetFile[];
	isLoading: boolean;
	totalChanges: number;
	totalAdditions: number;
	totalDeletions: number;
	worktreePath?: string;
	selectedFilePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
	onFilterChange: (filter: ChangesFilter) => void;
	onViewModeChange: (viewMode: ChangesViewMode) => void;
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRenameBranch: boolean;
}

export const ChangesTabContent = memo(function ChangesTabContent({
	workspaceId,
	status,
	commits,
	branches,
	filter,
	viewMode,
	baseBranch,
	files,
	isLoading,
	totalChanges,
	totalAdditions,
	totalDeletions,
	worktreePath,
	selectedFilePath,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
	onFilterChange,
	onViewModeChange,
	onBaseBranchChange,
	onRenameBranch,
	canRenameBranch,
}: ChangesTabContentProps) {
	const [foldSignal, setFoldSignal] = useState<FoldSignal>({
		epoch: 0,
		action: "expand",
	});
	const foldCollapsed =
		foldSignal.epoch > 0 && foldSignal.action === "collapse";
	const toggleFold = useCallback(
		() =>
			setFoldSignal((s) => {
				const wasCollapsed = s.epoch > 0 && s.action === "collapse";
				return {
					epoch: s.epoch + 1,
					action: wasCollapsed ? "expand" : "collapse",
				};
			}),
		[],
	);

	if (status.isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading changes...
			</div>
		);
	}

	if (!status.data) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Unable to load git status
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChangesHeader
				currentBranch={status.data.currentBranch}
				defaultBranchName={status.data.defaultBranch.name}
				baseBranch={baseBranch}
				branches={branches.data?.branches ?? []}
				onBaseBranchChange={onBaseBranchChange}
				onRenameBranch={onRenameBranch}
				canRename={canRenameBranch}
			/>
			<ChangesToolbar
				filter={filter}
				onFilterChange={onFilterChange}
				commits={commits.data?.commits ?? []}
				uncommittedCount={
					status.data.staged.length + status.data.unstaged.length
				}
				totalFiles={totalChanges}
				totalAdditions={totalAdditions}
				totalDeletions={totalDeletions}
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
				collapsed={foldCollapsed}
				onToggleFold={toggleFold}
			/>
			<ChangesFileList
				files={files}
				workspaceId={workspaceId}
				isLoading={isLoading}
				viewMode={viewMode}
				worktreePath={worktreePath}
				selectedFilePath={selectedFilePath}
				foldSignal={foldSignal}
				onSelectFile={onSelectFile}
				onOpenFile={onOpenFile}
				onOpenInEditor={onOpenInEditor}
			/>
		</div>
	);
});
