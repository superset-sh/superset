import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	Edit2,
	FolderOutput,
	FolderTree,
	GitCompare,
	Globe2,
	Monitor,
	SquareTerminal,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Tab, Worktree } from "shared/types";

interface TabItemProps {
	tab: Tab;
	worktreeId: string;
	worktree?: Worktree;
	workspaceId?: string;
	selectedTabId: string | undefined;
	selectedTabIds: Set<string>;
	parentTabId?: string; // The parent group tab ID (if this tab is inside a group)
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onTabRemove?: (tabId: string) => void;
	onGroupTabs?: (tabIds: string[]) => void;
	onMoveOutOfGroup?: (tabId: string, parentTabId: string) => void;
	onTabRename?: (tabId: string, newName: string) => void;
}

export function TabItem({
	tab,
	worktreeId,
	worktree,
	workspaceId,
	selectedTabId,
	selectedTabIds,
	parentTabId,
	onTabSelect,
	onTabRemove,
	onGroupTabs,
	onMoveOutOfGroup,
	onTabRename,
}: TabItemProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(tab.name);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleRemove = (e: React.MouseEvent) => {
		e.stopPropagation();
		onTabRemove?.(tab.id);
	};

	const handleClick = (e: React.MouseEvent) => {
		if (!isEditing) {
			onTabSelect(worktreeId, tab.id, e.shiftKey);
		}
	};

	const handleDoubleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!isEditing) {
			handleRename();
		}
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

	const handleRename = () => {
		setEditName(tab.name);
		setIsEditing(true);
	};

	const handleSaveRename = () => {
		const trimmedName = editName.trim();
		if (trimmedName !== "" && trimmedName !== tab.name) {
			onTabRename?.(tab.id, trimmedName);
		}
		setIsEditing(false);
	};

	const handleCancelRename = () => {
		setEditName(tab.name);
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSaveRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancelRename();
		}
	};

	const isSelected = selectedTabId === tab.id;
	const isMultiSelected = selectedTabIds.has(tab.id);
	const showMultiSelectHighlight = isMultiSelected && selectedTabIds.size > 1;
	const isInsideGroup = !!parentTabId;

	const IconComponent = (() => {
		switch (tab.type) {
			case "preview":
				return Monitor;
			case "port":
				return Globe2;
			case "diff":
				return GitCompare;
			default:
				return SquareTerminal;
		}
	})();

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					className={`group flex items-center gap-1.5 w-full h-7 px-2.5 text-xs rounded-md transition-all ${
						isSelected
							? "bg-neutral-800/80 text-neutral-200"
							: showMultiSelectHighlight
								? "bg-blue-900/30 text-blue-200"
								: "hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-300"
					}`}
					onClick={handleClick}
					onDoubleClick={handleDoubleClick}
				>
					<div className="flex items-center gap-1.5 flex-1 min-w-0">
						<IconComponent size={12} className="shrink-0" />
						{isEditing ? (
							<input
								ref={inputRef}
								type="text"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								onBlur={handleSaveRename}
								onKeyDown={handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								className="flex-1 bg-neutral-700 text-white px-2 py-0.5 rounded-sm text-xs outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
							/>
						) : (
							<span className="truncate">{tab.name}</span>
						)}
					</div>
					{!isEditing && (
						<Button
							variant="ghost"
							size="icon"
							onClick={handleRemove}
							className="h-4 w-4 p-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-neutral-700/80"
						>
							<X size={10} />
						</Button>
					)}
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={handleRename}>
					<Edit2 size={14} className="mr-2" />
					Rename
				</ContextMenuItem>
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
