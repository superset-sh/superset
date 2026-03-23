import { cn } from "@superset/ui/utils";
import { SEARCH_RESULT_ROW_HEIGHT } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface WorkspaceFilesSearchResultEntry {
	absolutePath: string;
	isDirectory: boolean;
	name: string;
	relativePath: string;
}

interface WorkspaceFilesSearchResultItemProps {
	entry: WorkspaceFilesSearchResultEntry;
	onActivate: (absolutePath: string) => void;
	selectedFilePath?: string;
}

const PATH_LABEL_MAX_CHARS = 48;

function getFolderLabel(relativePath: string): string {
	const normalizedPath = relativePath.replace(/\\/g, "/");
	const lastSlashIndex = normalizedPath.lastIndexOf("/");
	if (lastSlashIndex <= 0) {
		return "root";
	}

	return normalizedPath.slice(0, lastSlashIndex);
}

function truncatePathStart(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	const sliceLength = Math.max(1, maxLength - 3);
	return `...${value.slice(value.length - sliceLength)}`;
}

export function WorkspaceFilesSearchResultItem({
	entry,
	onActivate,
	selectedFilePath,
}: WorkspaceFilesSearchResultItemProps) {
	const folderLabel = getFolderLabel(entry.relativePath);
	const folderLabelDisplay = truncatePathStart(
		folderLabel,
		PATH_LABEL_MAX_CHARS,
	);
	const isSelected = selectedFilePath === entry.absolutePath;

	return (
		<button
			className={cn(
				"flex w-full cursor-pointer select-none items-center gap-1 px-1 text-left transition-colors hover:bg-accent/50",
				isSelected && "bg-accent",
			)}
			onClick={() => {
				if (!entry.isDirectory) {
					onActivate(entry.absolutePath);
				}
			}}
			style={{ height: SEARCH_RESULT_ROW_HEIGHT }}
			type="button"
		>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className="truncate text-[10px] text-muted-foreground"
					title={entry.relativePath}
				>
					{folderLabelDisplay}
				</span>
				<div className="flex min-w-0 items-center gap-1">
					<FileIcon
						className="size-4 shrink-0"
						fileName={entry.name}
						isDirectory={entry.isDirectory}
					/>
					<span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
				</div>
			</div>
		</button>
	);
}
