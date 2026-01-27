import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";
import { HiMiniXMark } from "react-icons/hi2";
import { MosaicDragType } from "react-mosaic-component";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import type { PaneStatus, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

export const TAB_TYPE = "TAB";

interface GroupItemProps {
	tab: Tab;
	index: number;
	isActive: boolean;
	status: PaneStatus | null;
	onSelect: () => void;
	onClose: () => void;
	onRename: (newName: string) => void;
	onPaneDrop?: (paneId: string) => void;
	onReorder?: (fromIndex: number, toIndex: number) => void;
	/** Show navigation shortcut hint - "prev" for ⌘⌥←, "next" for ⌘⌥→ */
	navHint?: "prev" | "next";
}

export function GroupItem({
	tab,
	index,
	isActive,
	status,
	onSelect,
	onClose,
	onRename,
	onPaneDrop,
	onReorder,
	navHint,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Drag source for tab reordering
	const [{ isDragging }, drag, preview] = useDrag(
		() => ({
			type: TAB_TYPE,
			item: { tabId: tab.id, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[tab.id, index],
	);

	// Hide the default browser drag preview to prevent snap-back animation
	useEffect(() => {
		preview(getEmptyImage(), { captureDraggingState: true });
	}, [preview]);

	// Drop target for pane drops AND tab reordering
	const [{ isOver, canDrop }, drop] = useDrop<
		{ tabId?: string; index?: number },
		{ handled: true },
		{ isOver: boolean; canDrop: boolean }
	>(
		() => ({
			accept: [MosaicDragType.WINDOW, TAB_TYPE],
			canDrop: (_item, monitor) => {
				const itemType = monitor.getItemType();
				if (itemType === TAB_TYPE) {
					// Tab reordering - can drop on any other tab
					const item = monitor.getItem() as { tabId: string; index: number };
					return item.tabId !== tab.id;
				}
				// Pane drop
				const { draggingPaneId, draggingSourceTabId } =
					useDragPaneStore.getState();
				return (
					!!draggingPaneId &&
					!!draggingSourceTabId &&
					draggingSourceTabId !== tab.id
				);
			},
			hover: (item, monitor) => {
				const itemType = monitor.getItemType();
				if (
					itemType === TAB_TYPE &&
					item.index !== undefined &&
					item.index !== index
				) {
					onReorder?.(item.index, index);
					item.index = index;
				}
			},
			drop: (_item, monitor) => {
				const itemType = monitor.getItemType();
				if (itemType === TAB_TYPE) {
					// Tab reorder is handled in hover
					return { handled: true };
				}
				// Pane drop
				const { draggingPaneId, draggingSourceTabId, clearDragging } =
					useDragPaneStore.getState();
				if (
					draggingPaneId &&
					draggingSourceTabId &&
					draggingSourceTabId !== tab.id
				) {
					onPaneDrop?.(draggingPaneId);
				}
				clearDragging();
				return { handled: true };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[onPaneDrop, onReorder, tab.id, index],
	);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const startEditing = () => {
		setEditValue(displayName);
		setIsEditing(true);
	};

	const handleSave = () => {
		const trimmedValue = editValue.trim();
		if (trimmedValue && trimmedValue !== displayName) {
			onRename(trimmedValue);
		}
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSave();
		} else if (e.key === "Escape") {
			e.preventDefault();
			setIsEditing(false);
		}
	};

	const tabStyles = cn(
		"flex items-center gap-2 transition-all w-full shrink-0 px-3 h-full",
		isActive
			? "text-foreground bg-border/30"
			: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
	);

	return (
		<div
			ref={(node) => {
				drag(drop(node));
			}}
			className={cn(
				"group relative flex items-center shrink-0 h-full border-r border-border",
				isOver && canDrop && "bg-primary/5",
				isDragging && "opacity-50 text-muted-foreground/50",
			)}
			style={{ cursor: isDragging ? "grabbing" : undefined }}
		>
			{isEditing ? (
				<div className={tabStyles}>
					<input
						ref={inputRef}
						type="text"
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onBlur={handleSave}
						onKeyDown={handleKeyDown}
						maxLength={64}
						className="text-sm bg-transparent border-none outline-none flex-1 text-left min-w-0"
					/>
				</div>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onSelect}
							onDoubleClick={startEditing}
							onAuxClick={(e) => {
								if (e.button === 1) {
									e.preventDefault();
									onClose();
								}
							}}
							className={tabStyles}
						>
							<span className="text-sm whitespace-nowrap overflow-hidden flex-1 text-left">
								{displayName}
							</span>
							{status && status !== "idle" && (
								<StatusIndicator status={status} />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" sideOffset={4}>
						{navHint ? (
							<HotkeyTooltipContent
								label={displayName}
								hotkeyId={navHint === "prev" ? "PREV_TAB" : "NEXT_TAB"}
							/>
						) : (
							<>
								<span>{displayName}</span>
								<span className="text-muted-foreground ml-1.5">
									Double-click to rename
								</span>
							</>
						)}
					</TooltipContent>
				</Tooltip>
			)}
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}
						className={cn(
							"absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 bg-muted hover:bg-background",
							isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
						)}
						aria-label="Close group"
					>
						<HiMiniXMark className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Close group
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
