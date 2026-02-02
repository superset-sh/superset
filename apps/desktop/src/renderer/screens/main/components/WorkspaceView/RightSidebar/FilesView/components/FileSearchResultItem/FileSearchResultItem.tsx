import { cn } from "@superset/ui/utils";
import type { DirectoryEntry } from "shared/file-tree-types";
import { SEARCH_RESULT_ROW_HEIGHT } from "../../constants";
import { getFileIcon } from "../../utils";

interface FileSearchResultItemProps {
	entry: DirectoryEntry;
	onActivate: (entry: DirectoryEntry) => void;
	onContextMenu: (entry: DirectoryEntry | null) => void;
}

const PATH_LABEL_MAX_CHARS = 48;

function getFolderLabel(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash <= 0) {
		return "root";
	}
	return normalized.slice(0, lastSlash);
}

function truncatePathStart(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	const sliceLength = Math.max(1, maxLength - 3);
	return `...${value.slice(value.length - sliceLength)}`;
}

export function FileSearchResultItem({
	entry,
	onActivate,
	onContextMenu,
}: FileSearchResultItemProps) {
	const { icon: Icon, color } = getFileIcon(
		entry.name,
		entry.isDirectory,
		false,
	);
	const folderLabel = getFolderLabel(entry.relativePath);
	const folderLabelDisplay = truncatePathStart(
		folderLabel,
		PATH_LABEL_MAX_CHARS,
	);

	const handleClick = () => {
		if (!entry.isDirectory) {
			onActivate(entry);
		}
	};

	const handleDoubleClick = () => {
		if (!entry.isDirectory) {
			onActivate(entry);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (!entry.isDirectory) {
				onActivate(entry);
			}
		}
	};

	return (
		<div
			role="treeitem"
			tabIndex={0}
			style={{ height: SEARCH_RESULT_ROW_HEIGHT }}
			className={cn(
				"flex items-center gap-1 px-1 cursor-pointer select-none",
				"hover:bg-accent/50 transition-colors",
			)}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
			onContextMenu={(e) => {
				e.preventDefault();
				onContextMenu(entry);
			}}
		>
			<span className="flex items-center justify-center w-4 h-4 shrink-0" />
			<div className="flex flex-col min-w-0 flex-1 gap-0.5">
				<span
					className="text-[10px] text-muted-foreground truncate"
					title={entry.relativePath}
				>
					{folderLabelDisplay}
				</span>
				<div className="flex items-center gap-1 min-w-0">
					<Icon className={cn("size-4 shrink-0", color)} />
					<span className="flex-1 min-w-0 text-xs truncate">{entry.name}</span>
				</div>
			</div>
		</div>
	);
}
