import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { FileListGrouped } from "./FileListGrouped";
import { FileListTree } from "./FileListTree";
import { FileListVirtualized } from "./FileListVirtualized";

const LARGE_FILE_LIST_THRESHOLD = 200;

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
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	if (files.length === 0) {
		return null;
	}

	if (files.length >= LARGE_FILE_LIST_THRESHOLD) {
		return (
			<FileListVirtualized
				files={files}
				selectedFile={selectedFile}
				selectedCommitHash={selectedCommitHash}
				onFileSelect={onFileSelect}
				showStats={showStats}
				onStage={onStage}
				onUnstage={onUnstage}
				isActioning={isActioning}
				worktreePath={worktreePath}
				onDiscard={onDiscard}
				category={category}
				commitHash={commitHash}
				isExpandedView={isExpandedView}
				projectId={projectId}
				defaultApp={defaultApp}
			/>
		);
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
				defaultApp={defaultApp}
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
			defaultApp={defaultApp}
		/>
	);
}
