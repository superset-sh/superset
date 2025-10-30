import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { FolderOutput, FolderTree, SquareTerminal, X } from "lucide-react";
import type { Tab } from "shared/types";

interface TabItemProps {
	tab: Tab;
	worktreeId: string;
	selectedTabId: string | undefined;
	selectedTabIds: Set<string>;
	parentTabId?: string; // The parent group tab ID (if this tab is inside a group)
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onTabRemove?: (tabId: string) => void;
	onGroupTabs?: (tabIds: string[]) => void;
	onMoveOutOfGroup?: (tabId: string, parentTabId: string) => void;
}

export function TabItem({
	tab,
	worktreeId,
	selectedTabId,
	selectedTabIds,
	parentTabId,
	onTabSelect,
	onTabRemove,
	onGroupTabs,
	onMoveOutOfGroup,
}: TabItemProps) {
	const handleRemove = (e: React.MouseEvent) => {
		e.stopPropagation();
		onTabRemove?.(tab.id);
	};

	const handleClick = (e: React.MouseEvent) => {
		onTabSelect(worktreeId, tab.id, e.shiftKey);
	};

	const handleGroupSelected = () => {
		if (onGroupTabs && selectedTabIds.size > 1) {
			onGroupTabs(Array.from(selectedTabIds));
		}
	};

	const handleMoveOut = () => {
		if (onMoveOutOfGroup && parentTabId) {
			onMoveOutOfGroup(tab.id, parentTabId);
		}
	};

	const isSelected = selectedTabId === tab.id;
	const isMultiSelected = selectedTabIds.has(tab.id);
	const showMultiSelectHighlight = isMultiSelected && selectedTabIds.size > 1;
	const isInsideGroup = !!parentTabId;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					className={`group flex items-center gap-1 w-full h-8 px-3 text-sm rounded-md [transition:all_0.2s,border_0s] ${
						isSelected
							? "bg-neutral-800 border border-neutral-700"
							: showMultiSelectHighlight
								? "bg-blue-900/30 border border-blue-700/50"
								: ""
					}`}
					onClick={handleClick}
				>
					<div className="flex items-center gap-2 flex-1">
						<SquareTerminal size={14} />
						<span className="truncate">{tab.name}</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleRemove}
						className="h-5 w-5 p-0 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-neutral-700"
					>
						<X size={12} />
					</Button>
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				{isInsideGroup && (
					<ContextMenuItem onClick={handleMoveOut}>
						<FolderOutput size={14} className="mr-2" />
						Move Out of Group
					</ContextMenuItem>
				)}
				{selectedTabIds.size > 1 && (
					<ContextMenuItem onClick={handleGroupSelected}>
						<FolderTree size={14} className="mr-2" />
						Group {selectedTabIds.size} Tabs
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
