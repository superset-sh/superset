import { useCallback, useState } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";
import { FolderRow } from "../FolderRow";

interface FileListGroupedProps {
	files: ChangedFile[];
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

interface FolderGroup {
	folderPath: string;
	folderName: string;
	files: ChangedFile[];
}

function groupFilesByFolder(files: ChangedFile[]): FolderGroup[] {
	const folderMap = new Map<string, ChangedFile[]>();

	for (const file of files) {
		const pathParts = file.path.split("/");
		const folderPath =
			pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";

		if (!folderMap.has(folderPath)) {
			folderMap.set(folderPath, []);
		}
		folderMap.get(folderPath)?.push(file);
	}

	return Array.from(folderMap.entries())
		.map(([folderPath, files]) => {
			const pathParts = folderPath.split("/");
			const folderName =
				folderPath === "" ? "" : pathParts[pathParts.length - 1];

			return {
				folderPath,
				folderName,
				files: files.sort((a, b) => {
					const aName = a.path.split("/").pop() || "";
					const bName = b.path.split("/").pop() || "";
					return aName.localeCompare(bName);
				}),
			};
		})
		.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
}

interface FolderGroupItemProps {
	group: FolderGroup;
	selectedFile: ChangedFile | null;
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

function FolderGroupItem({
	group,
	selectedFile,
	onFileSelect,
	showStats,
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
}: FolderGroupItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const displayName = group.folderPath || "Root Path";

	const handleStageAll = useCallback(() => {
		if (onStageFiles) {
			onStageFiles(group.files);
		} else if (onStage) {
			for (const file of group.files) {
				onStage(file);
			}
		}
	}, [group.files, onStage, onStageFiles]);

	const handleUnstageAll = useCallback(() => {
		if (onUnstageFiles) {
			onUnstageFiles(group.files);
		} else if (onUnstage) {
			for (const file of group.files) {
				onUnstage(file);
			}
		}
	}, [group.files, onUnstage, onUnstageFiles]);

	const handleDiscardAll = useCallback(() => {
		if (!onDiscard) return;
		for (const file of group.files) {
			onDiscard(file);
		}
	}, [group.files, onDiscard]);

	return (
		<FolderRow
			name={displayName}
			isExpanded={isExpanded}
			onToggle={setIsExpanded}
			fileCount={group.files.length}
			variant="grouped"
			folderPath={group.folderPath}
			worktreePath={worktreePath}
			projectId={projectId}
			onStageAll={onStage || onStageFiles ? handleStageAll : undefined}
			onUnstageAll={onUnstage || onUnstageFiles ? handleUnstageAll : undefined}
			onDiscardAll={onDiscard ? handleDiscardAll : undefined}
			isActioning={isActioning}
		>
			{group.files.map((file) => (
				<FileItem
					key={file.path}
					file={file}
					isSelected={selectedFile?.path === file.path}
					onClick={() => onFileSelect(file)}
					showStats={showStats}
					onStage={onStage ? () => onStage(file) : undefined}
					onUnstage={onUnstage ? () => onUnstage(file) : undefined}
					isActioning={isActioning}
					worktreePath={worktreePath}
					projectId={projectId}
					onDiscard={onDiscard ? () => onDiscard(file) : undefined}
					category={category}
					commitHash={commitHash}
					isExpandedView={isExpandedView}
				/>
			))}
		</FolderRow>
	);
}

export function FileListGrouped({
	files,
	selectedFile,
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
}: FileListGroupedProps) {
	const groups = groupFilesByFolder(files);

	return (
		<div className="flex flex-col overflow-hidden">
			{groups.map((group) => (
				<FolderGroupItem
					key={group.folderPath || "__root__"}
					group={group}
					selectedFile={selectedFile}
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
			))}
		</div>
	);
}
