import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { VscAdd, VscDiscard, VscRemove } from "react-icons/vsc";
import { getOrderedChangeSectionIds } from "renderer/stores/changes/section-order";
import type {
	ChangeCategory,
	ChangedFile,
	CommitInfo,
} from "shared/changes-types";
import { CommitListVirtualized } from "../../components/CommitListVirtualized";
import { FileList } from "../../components/FileList";
import type { ChangesViewMode } from "../../types";

export interface OrderedSection {
	id: ChangeCategory;
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
	content: ReactNode;
	actions?: ReactNode;
}

interface UseOrderedSectionsInput {
	sectionOrder: ChangeCategory[];
	effectiveBaseBranch: string;
	expandedSections: Record<ChangeCategory, boolean>;
	toggleSection: (section: ChangeCategory) => void;
	fileListViewMode: ChangesViewMode;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	worktreePath: string;
	projectId?: string;
	isExpandedView?: boolean;
	againstBaseFiles: ChangedFile[];
	onAgainstBaseFileSelect: (file: ChangedFile) => void;
	commitsWithFiles: CommitInfo[];
	expandedCommits: Set<string>;
	onCommitToggle: (commitHash: string) => void;
	onCommitFileSelect: (file: ChangedFile, commitHash: string) => void;
	stagedFiles: ChangedFile[];
	onStagedFileSelect: (file: ChangedFile) => void;
	onUnstageFile: (file: ChangedFile) => void;
	onUnstageFiles: (files: ChangedFile[]) => void;
	onShowDiscardStagedDialog: () => void;
	onUnstageAll: () => void;
	isDiscardAllStagedPending: boolean;
	isUnstageAllPending: boolean;
	isStagedActioning: boolean;
	unstagedFiles: ChangedFile[];
	onUnstagedFileSelect: (file: ChangedFile) => void;
	onStageFile: (file: ChangedFile) => void;
	onStageFiles: (files: ChangedFile[]) => void;
	onDiscardFile: (file: ChangedFile) => void;
	onShowDiscardUnstagedDialog: () => void;
	onStageAll: () => void;
	isDiscardAllUnstagedPending: boolean;
	isStageAllPending: boolean;
	isUnstagedActioning: boolean;
}

export function useOrderedSections({
	sectionOrder,
	effectiveBaseBranch,
	expandedSections,
	toggleSection,
	fileListViewMode,
	selectedFile,
	selectedCommitHash,
	worktreePath,
	projectId,
	isExpandedView,
	againstBaseFiles,
	onAgainstBaseFileSelect,
	commitsWithFiles,
	expandedCommits,
	onCommitToggle,
	onCommitFileSelect,
	stagedFiles,
	onStagedFileSelect,
	onUnstageFile,
	onUnstageFiles,
	onShowDiscardStagedDialog,
	onUnstageAll,
	isDiscardAllStagedPending,
	isUnstageAllPending,
	isStagedActioning,
	unstagedFiles,
	onUnstagedFileSelect,
	onStageFile,
	onStageFiles,
	onDiscardFile,
	onShowDiscardUnstagedDialog,
	onStageAll,
	isDiscardAllUnstagedPending,
	isStageAllPending,
	isUnstagedActioning,
}: UseOrderedSectionsInput) {
	const commitCount = commitsWithFiles.length;

	const sectionDefinitions: Record<ChangeCategory, OrderedSection> = {
		"against-base": {
			id: "against-base",
			title: `Against ${effectiveBaseBranch}`,
			count: againstBaseFiles.length,
			isExpanded: expandedSections["against-base"],
			onToggle: () => toggleSection("against-base"),
			content: expandedSections["against-base"] ? (
				<FileList
					files={againstBaseFiles}
					viewMode={fileListViewMode}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onAgainstBaseFileSelect}
					worktreePath={worktreePath}
					projectId={projectId}
					category="against-base"
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
		committed: {
			id: "committed",
			title: "Commits",
			count: commitCount,
			isExpanded: expandedSections.committed,
			onToggle: () => toggleSection("committed"),
			content: expandedSections.committed ? (
				<CommitListVirtualized
					commits={commitsWithFiles}
					expandedCommits={expandedCommits}
					onCommitToggle={onCommitToggle}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onCommitFileSelect}
					viewMode={fileListViewMode}
					worktreePath={worktreePath}
					projectId={projectId}
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
		staged: {
			id: "staged",
			title: "Staged",
			count: stagedFiles.length,
			isExpanded: expandedSections.staged,
			onToggle: () => toggleSection("staged"),
			actions: (
				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={onShowDiscardStagedDialog}
								disabled={isDiscardAllStagedPending}
							>
								<VscDiscard className="w-3.5 h-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Discard all staged</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={onUnstageAll}
								disabled={isUnstageAllPending}
							>
								<VscRemove className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Unstage all</TooltipContent>
					</Tooltip>
				</div>
			),
			content: expandedSections.staged ? (
				<FileList
					files={stagedFiles}
					viewMode={fileListViewMode}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onStagedFileSelect}
					onUnstage={onUnstageFile}
					onUnstageFiles={onUnstageFiles}
					isActioning={isStagedActioning}
					worktreePath={worktreePath}
					projectId={projectId}
					category="staged"
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
		unstaged: {
			id: "unstaged",
			title: "Unstaged",
			count: unstagedFiles.length,
			isExpanded: expandedSections.unstaged,
			onToggle: () => toggleSection("unstaged"),
			actions: (
				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={onShowDiscardUnstagedDialog}
								disabled={isDiscardAllUnstagedPending}
							>
								<VscDiscard className="w-3.5 h-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Discard all unstaged</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={onStageAll}
								disabled={isStageAllPending}
							>
								<VscAdd className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Stage all</TooltipContent>
					</Tooltip>
				</div>
			),
			content: expandedSections.unstaged ? (
				<FileList
					files={unstagedFiles}
					viewMode={fileListViewMode}
					selectedFile={selectedFile}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={onUnstagedFileSelect}
					onStage={onStageFile}
					onStageFiles={onStageFiles}
					isActioning={isUnstagedActioning}
					worktreePath={worktreePath}
					projectId={projectId}
					onDiscard={onDiscardFile}
					category="unstaged"
					isExpandedView={isExpandedView}
				/>
			) : null,
		},
	};

	return getOrderedChangeSectionIds(sectionOrder).map(
		(section) => sectionDefinitions[section],
	);
}
