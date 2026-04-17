import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { memo } from "react";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { ChangesetFile } from "../../../../../../hooks/useChangeset";
import { ChangesFileList } from "../ChangesFileList";
import { ChangesHeader } from "../ChangesHeader";

type RouterOutputs = inferRouterOutputs<AppRouter>;

interface ChangesTabContentProps {
	status: {
		data: RouterOutputs["git"]["getStatus"] | undefined;
		isLoading: boolean;
	};
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	filter: ChangesFilter;
	baseBranch: string | null;
	files: ChangesetFile[];
	isLoading: boolean;
	totalChanges: number;
	totalAdditions: number;
	totalDeletions: number;
	onSelectFile?: (path: string) => void;
	onFilterChange: (filter: ChangesFilter) => void;
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRenameBranch: boolean;
}

export const ChangesTabContent = memo(function ChangesTabContent({
	status,
	commits,
	branches,
	filter,
	baseBranch,
	files,
	isLoading,
	totalChanges,
	totalAdditions,
	totalDeletions,
	onSelectFile,
	onFilterChange,
	onBaseBranchChange,
	onRenameBranch,
	canRenameBranch,
}: ChangesTabContentProps) {
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
				commitCount={commits.data?.commits.length ?? 0}
				totalFiles={totalChanges}
				totalAdditions={totalAdditions}
				totalDeletions={totalDeletions}
				filter={filter}
				onFilterChange={onFilterChange}
				commits={commits.data?.commits ?? []}
				uncommittedCount={
					status.data.staged.length + status.data.unstaged.length
				}
				branches={branches.data?.branches ?? []}
				onBaseBranchChange={onBaseBranchChange}
				onRenameBranch={onRenameBranch}
				canRename={canRenameBranch}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ChangesFileList
					files={files}
					isLoading={isLoading}
					onSelectFile={onSelectFile}
				/>
			</div>
		</div>
	);
});
