import type { Tab } from "renderer/stores/tabs/types";
import type { ChangedFile } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { FileListGrouped } from "./FileListGrouped";
import { FileListTree } from "./FileListTree";

/**
 * Shared context menu props for file items.
 * All callbacks receive the file so they can be passed down without per-file binding.
 */
export interface FileContextMenuProps {
	currentTabId: string;
	availableTabs: Tab[];
	onOpenInSplitHorizontal: (file: ChangedFile) => void;
	onOpenInSplitVertical: (file: ChangedFile) => void;
	onOpenInApp: (file: ChangedFile) => void;
	onOpenInNewTab: (file: ChangedFile) => void;
	onMoveToTab: (file: ChangedFile, tabId: string) => void;
	onDiscardChanges?: (file: ChangedFile) => void;
}

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
	/** Context menu props - if provided, enables right-click menu */
	contextMenuProps?: FileContextMenuProps;
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
	contextMenuProps,
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
				contextMenuProps={contextMenuProps}
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
			contextMenuProps={contextMenuProps}
		/>
	);
}
