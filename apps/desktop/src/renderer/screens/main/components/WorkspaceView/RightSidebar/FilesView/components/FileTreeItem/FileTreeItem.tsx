import type { ItemInstance } from "@headless-tree/core";
import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { DirectoryEntry } from "shared/file-tree-types";
import { getFileIcon } from "../../utils";

interface FileTreeItemProps {
	item: ItemInstance<DirectoryEntry>;
	entry: DirectoryEntry;
	rowHeight: number;
	indent: number;
	onActivate: (entry: DirectoryEntry) => void;
	onOpenInEditor: (entry: DirectoryEntry) => void;
	onContextMenu: (entry: DirectoryEntry | null) => void;
}

export function FileTreeItem({
	item,
	entry,
	rowHeight,
	indent,
	onActivate,
	onOpenInEditor,
	onContextMenu,
}: FileTreeItemProps) {
	const isFolder = entry.isDirectory;
	const isExpanded = item.isExpanded();
	const level = item.getItemMeta().level;
	const { icon: Icon, color } = getFileIcon(entry.name, isFolder, isExpanded);

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isFolder) {
			if (isExpanded) {
				item.collapse();
			} else {
				item.expand();
			}
		} else {
			onActivate(entry);
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onOpenInEditor(entry);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (isFolder) {
				if (isExpanded) {
					item.collapse();
				} else {
					item.expand();
				}
			} else {
				onActivate(entry);
			}
		}
	};

	return (
		<div
			{...item.getProps()}
			data-item-id={item.getId()}
			style={{
				height: rowHeight,
				paddingLeft: level * indent,
			}}
			role="treeitem"
			tabIndex={0}
			aria-expanded={isFolder ? isExpanded : undefined}
			className={cn(
				"flex items-center gap-1 px-1 cursor-pointer select-none",
				"hover:bg-accent/50 transition-colors",
				item.isSelected() && "bg-accent",
				item.isFocused() && !item.isSelected() && "ring-1 ring-ring ring-inset",
			)}
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			onKeyDown={handleKeyDown}
			onContextMenu={(e) => {
				e.preventDefault();
				onContextMenu(entry);
			}}
		>
			<span className="flex items-center justify-center w-4 h-4 shrink-0">
				{isFolder ? (
					isExpanded ? (
						<LuChevronDown className="size-3.5 text-muted-foreground" />
					) : (
						<LuChevronRight className="size-3.5 text-muted-foreground" />
					)
				) : null}
			</span>

			<Icon className={cn("size-4 shrink-0", color)} />

			<span className="flex-1 min-w-0 text-xs truncate">{entry.name}</span>
		</div>
	);
}
