import type { ChangedFile } from "shared/changes-types";
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
	/** Callback for staging a file */
	onStage?: (file: ChangedFile) => void;
	/** Callback for unstaging a file */
	onUnstage?: (file: ChangedFile) => void;
	/** Whether an action is currently pending */
	isActioning?: boolean;
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
	isActioning,
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
				isActioning={isActioning}
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
			showStats={showStats}
			onStage={onStage}
			onUnstage={onUnstage}
			isActioning={isActioning}
		/>
	);
}
