import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { FileListGrouped } from "./FileListGrouped";
import { FileListTree } from "./FileListTree";

interface FileListProps {
	files: ChangedFile[];
	viewMode: ChangesViewMode;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	/** Single click - opens in preview mode */
	onFileSelect: (file: ChangedFile) => void;
	/** Double click - opens pinned (permanent) */
	onFileDoubleClick?: (file: ChangedFile) => void;
	showStats?: boolean;
	/** Callback for staging a file */
	onStage?: (file: ChangedFile) => void;
	/** Callback for unstaging a file */
	onUnstage?: (file: ChangedFile) => void;
	/** Whether an action is currently pending */
	isActioning?: boolean;
	/** Worktree path for constructing absolute paths */
	worktreePath?: string;
	/** Callback for discarding changes */
	onDiscard?: (file: ChangedFile) => void;
	/** Category for scroll sync highlighting */
	category?: ChangeCategory;
	/** Commit hash for committed files (scroll sync) */
	commitHash?: string;
}

export function FileList({
	files,
	viewMode,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	onFileDoubleClick,
	showStats = true,
	onStage,
	onUnstage,
	isActioning,
	worktreePath,
	onDiscard,
	category,
	commitHash,
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
				onFileDoubleClick={onFileDoubleClick}
				showStats={showStats}
				onStage={onStage}
				onUnstage={onUnstage}
				isActioning={isActioning}
				worktreePath={worktreePath}
				onDiscard={onDiscard}
				category={category}
				commitHash={commitHash}
			/>
		);
	}

	// Grouped mode - group files by folder
	return (
		<FileListGrouped
			files={files}
			selectedFile={selectedFile}
			selectedCommitHash={selectedCommitHash}
			onFileSelect={onFileSelect}
			onFileDoubleClick={onFileDoubleClick}
			showStats={showStats}
			onStage={onStage}
			onUnstage={onUnstage}
			isActioning={isActioning}
			worktreePath={worktreePath}
			onDiscard={onDiscard}
			category={category}
			commitHash={commitHash}
		/>
	);
}
