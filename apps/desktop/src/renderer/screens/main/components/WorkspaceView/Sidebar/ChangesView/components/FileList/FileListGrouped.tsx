import { useState } from "react";
import type { ChangedFile } from "shared/changes-types";
import { FileItem } from "../FileItem";
import { FolderRow } from "../FolderRow";

interface FileListGroupedProps {
	files: ChangedFile[];
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile) => void;
	showStats?: boolean;
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
}

function FolderGroupItem({
	group,
	selectedFile,
	onFileSelect,
	showStats,
}: FolderGroupItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const isRoot = group.folderPath === "";
	const displayName = isRoot ? "Root Path" : group.folderPath;

	return (
		<FolderRow
			name={displayName}
			isExpanded={isExpanded}
			onToggle={setIsExpanded}
			fileCount={group.files.length}
			variant="grouped"
		>
			{group.files.map((file) => (
				<FileItem
					key={file.path}
					file={file}
					isSelected={selectedFile?.path === file.path}
					onClick={() => onFileSelect(file)}
					showStats={showStats}
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
				/>
			))}
		</div>
	);
}
