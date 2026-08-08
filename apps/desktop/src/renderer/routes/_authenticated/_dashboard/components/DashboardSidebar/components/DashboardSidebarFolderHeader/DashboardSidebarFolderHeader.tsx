import { useDroppable } from "@dnd-kit/core";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { LuEllipsis } from "react-icons/lu";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { DashboardSidebarFolder } from "../../types";
import { hasCustomColor } from "../../utils/folderColor";
import { folderDropId } from "../../utils/folderDnd";
import { isImageIcon } from "../../utils/folderIcon";
import { FolderActionsMenuItems } from "./components/FolderActionsMenuItems";

interface DashboardSidebarFolderHeaderProps {
	folder: DashboardSidebarFolder;
	projectCount: number;
	/** Auto-enter rename mode (used right after the folder is created). */
	autoRename?: boolean;
	/** Called once an auto-initiated rename is committed or cancelled, so the
	 * caller can clear its pending flag and not re-open rename on remount. */
	onAutoRenameEnd?: () => void;
	onToggleCollapse: (folderId: string) => void;
	onRename: (folderId: string, name: string) => void;
	onSetColor: (folderId: string, color: string | null) => void;
	onSetIcon: (folderId: string, icon: string | null) => void;
	onDelete: (folderId: string) => void;
}

/**
 * Header row for a sidebar folder — the grouping level above projects.
 * Chevron collapse, icon or colour-dot identity, inline rename, and a hover
 * actions menu; the folder colour also tints the rail under its contents.
 */
export function DashboardSidebarFolderHeader({
	folder,
	projectCount,
	autoRename = false,
	onAutoRenameEnd,
	onToggleCollapse,
	onRename,
	onSetColor,
	onSetIcon,
	onDelete,
}: DashboardSidebarFolderHeaderProps) {
	const [isRenaming, setIsRenaming] = useState(autoRename);
	const [renameValue, setRenameValue] = useState(folder.name);

	useEffect(() => {
		if (!isRenaming) setRenameValue(folder.name);
	}, [folder.name, isRenaming]);

	const startRename = useCallback(() => {
		setRenameValue(folder.name);
		setIsRenaming(true);
	}, [folder.name]);

	const submitRename = useCallback(() => {
		const trimmed = renameValue.trim();
		if (trimmed) onRename(folder.id, trimmed);
		setIsRenaming(false);
		onAutoRenameEnd?.();
	}, [folder.id, onRename, renameValue, onAutoRenameEnd]);

	const cancelRename = useCallback(() => {
		setRenameValue(folder.name);
		setIsRenaming(false);
		onAutoRenameEnd?.();
	}, [folder.name, onAutoRenameEnd]);

	// Dropping a dragged project on this header moves it into the folder.
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: folderDropId(folder.id),
	});

	const renderMenuItems = (kind: "context" | "dropdown") => (
		<FolderActionsMenuItems
			folder={folder}
			kind={kind}
			onRename={startRename}
			onSetColor={(color) => onSetColor(folder.id, color)}
			onSetIcon={(icon) => onSetIcon(folder.id, icon)}
			onDelete={() => onDelete(folder.id)}
		/>
	);

	const chevron = (
		<div className="mr-2 grid h-5 w-5 shrink-0 items-center justify-center [&>*]:col-start-1 [&>*]:row-start-1">
			<HiChevronRight
				className={cn(
					"size-3 text-muted-foreground transition-transform duration-150",
					!folder.isCollapsed && "rotate-90",
				)}
			/>
		</div>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={setDropRef}
					className={cn(
						"group relative mx-2 flex min-h-7 items-center rounded-md py-1 pl-2 pr-2 text-[13px] font-semibold",
						"text-muted-foreground transition-colors hover:bg-fill-hover",
						// Highlight while a dragged project hovers this folder.
						isOver && "bg-fill-hover ring-1 ring-primary/50",
					)}
				>
					{isRenaming ? (
						<div className="flex min-w-0 flex-1 items-center">
							{chevron}
							<RenameInput
								value={renameValue}
								onChange={setRenameValue}
								onSubmit={submitRename}
								onCancel={cancelRename}
								className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-semibold text-muted-foreground outline-none"
							/>
						</div>
					) : (
						/* The toggle is a real button and the actions trigger is its
						 * sibling, so the row is one tab stop with no nested control;
						 * the stretched ::before keeps the whole row clickable. */
						<button
							type="button"
							aria-expanded={!folder.isCollapsed}
							onClick={() => onToggleCollapse(folder.id)}
							className="flex min-w-0 flex-1 items-center text-left before:absolute before:inset-0 before:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{chevron}
							<span className="flex min-w-0 flex-1 items-center gap-1.5">
								{/* Icon when set (#1176), colour dot as the fallback identity. */}
								{folder.icon ? (
									isImageIcon(folder.icon) ? (
										<img
											src={folder.icon}
											alt=""
											className="size-3.5 shrink-0 rounded-sm object-cover"
										/>
									) : (
										<span className="shrink-0 text-[13px] leading-none">
											{folder.icon}
										</span>
									)
								) : (
									hasCustomColor(folder.color) && (
										<span
											className="size-2 shrink-0 rounded-full"
											style={{ backgroundColor: folder.color ?? undefined }}
										/>
									)
								)}
								<span className="truncate">{folder.name}</span>
								{/* Children are the count while expanded; only quantify when hidden. */}
								{folder.isCollapsed && (
									<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
										{projectCount}
									</span>
								)}
							</span>
						</button>
					)}

					{!isRenaming && (
						// Paints above the toggle's stretched hit area. Revealed while the
						// row holds focus too, otherwise display:none would put the
						// trigger out of reach of the keyboard.
						<div className="relative z-10 ml-1 hidden size-5 shrink-0 items-center justify-center group-hover:flex group-has-[:focus]:flex has-[[data-state=open]]:flex">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5"
										aria-label="Folder actions"
									>
										<LuEllipsis className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-44">
									{renderMenuItems("dropdown")}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-44">
				{renderMenuItems("context")}
			</ContextMenuContent>
		</ContextMenu>
	);
}
