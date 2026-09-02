import { Trans } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { Spinner } from "@superset/ui/spinner";
import type { inferRouterOutputs } from "@trpc/server";
import { memo, useCallback, useState } from "react";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { FoldSignal } from "../ChangesFileList";
import { ChangesFileList } from "../ChangesFileList";
import { ChangesToolbar } from "../ChangesToolbar";
import { shouldShowChangesLoading } from "./shouldShowChangesLoading";

type RouterOutputs = inferRouterOutputs<AppRouter>;

interface ChangesTabContentProps {
	workspaceId: string;
	status: {
		data: RouterOutputs["git"]["getStatus"] | undefined;
		isFetching: boolean;
		isLoading: boolean;
	};
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	filter: ChangesFilter;
	viewMode: ChangesViewMode;
	baseBranch: string | null;
	files: ChangesetFile[];
	isLoading: boolean;
	worktreePath?: string;
	selectedFilePath?: string;
	selectedChangeKey?: string;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
	onFilterChange: (filter: ChangesFilter) => void;
	onViewModeChange: (viewMode: ChangesViewMode) => void;
	onBaseBranchChange: (branchName: string | null) => void;
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
	worktreePath,
	selectedFilePath,
	selectedChangeKey,
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

	if (shouldShowChangesLoading(status)) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner className="size-3.5" />
				<span>
					<Trans>Loading changes...</Trans>
				</span>
			</div>
		);
	}

	if (!status.data) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				<Trans>Unable to load git status</Trans>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="pt-1">
				<ChangesToolbar
					filter={filter}
					onFilterChange={onFilterChange}
					commits={commits.data?.commits ?? []}
					uncommittedCount={
						status.data.staged.length + status.data.unstaged.length
					}
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
					collapsed={foldCollapsed}
					onToggleFold={toggleFold}
					baseBranch={baseBranch ?? status.data.defaultBranch.name}
					branches={branches.data?.branches ?? []}
					// Picking the repo default clears the override (null) instead of
					// pinning it, so the workspace follows a later default change.
					onBaseBranchChange={(branchName) =>
						onBaseBranchChange(
							branchName === status.data?.defaultBranch.name
								? null
								: branchName,
						)
					}
					currentBranchName={status.data.currentBranch.name}
					canRenameBranch={canRenameBranch}
					onRenameBranch={onRenameBranch}
				/>
			</div>
			<ChangesFileList
				files={files}
				workspaceId={workspaceId}
				isLoading={isLoading}
				viewMode={viewMode}
				worktreePath={worktreePath}
				selectedFilePath={selectedFilePath}
				selectedChangeKey={selectedChangeKey}
				foldSignal={foldSignal}
				onSelectFile={onSelectFile}
				onOpenFile={onOpenFile}
				onOpenInEditor={onOpenInEditor}
			/>
		</div>
	);
});
