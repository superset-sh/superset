import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { FileListGrouped } from "./FileListGrouped";
import { FileListTree } from "./FileListTree";

interface FileListProps {
	files: ChangedFile[];
	viewMode: ChangesViewMode;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
	onStage?: (file: ChangedFile) => void;
	onUnstage?: (file: ChangedFile) => void;
	onStageFiles?: (files: ChangedFile[]) => void;
	onUnstageFiles?: (files: ChangedFile[]) => void;
	isActioning?: boolean;
	worktreePath: string;
	onDiscard?: (file: ChangedFile) => void;
	category?: ChangeCategory;
	commitHash?: string;
	isExpandedView?: boolean;
	projectId?: string;
}

export function FileList({
	files,
	viewMode,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	showStats = true,
	onStage,
	onUnstage,
	onStageFiles,
	onUnstageFiles,
	isActioning,
	worktreePath,
	onDiscard,
	category,
	commitHash,
	isExpandedView,
	projectId,
}: FileListProps) {
	if (files.length === 0) {
		return null;
	}

	if (viewMode === "tree") {
		return (
			<FileListTree
				files={files}
				selectedFile={selectedFile}
				selectedCommitHash={selectedCommitHash}
				onFileSelect={onFileSelect}
				showStats={showStats}
				onStage={onStage}
				onUnstage={onUnstage}
				onStageFiles={onStageFiles}
				onUnstageFiles={onUnstageFiles}
				isActioning={isActioning}
				worktreePath={worktreePath}
				onDiscard={onDiscard}
				category={category}
				commitHash={commitHash}
				isExpandedView={isExpandedView}
				projectId={projectId}
			/>
		);
	}

	return (
		<FileListGrouped
			files={files}
			selectedFile={selectedFile}
			selectedCommitHash={selectedCommitHash}
			onFileSelect={onFileSelect}
			showStats={showStats}
			onStage={onStage}
			onUnstage={onUnstage}
			onStageFiles={onStageFiles}
			onUnstageFiles={onUnstageFiles}
			isActioning={isActioning}
			worktreePath={worktreePath}
			onDiscard={onDiscard}
			category={category}
			commitHash={commitHash}
			isExpandedView={isExpandedView}
			projectId={projectId}
		/>
	);
}
