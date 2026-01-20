import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import { MosaicDragType } from "react-mosaic-component";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import type { PaneStatus, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

interface GroupItemProps {
	tab: Tab;
	isActive: boolean;
	status: PaneStatus | null;
	onSelect: () => void;
	onClose: () => void;
	onRename: (newName: string) => void;
	onPaneDrop?: (paneId: string) => void;
}

export function GroupItem({
	tab,
	isActive,
	status,
	onSelect,
	onClose,
	onRename,
	onPaneDrop,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const [{ isOver, canDrop }, drop] = useDrop<
		unknown,
		{ handled: true },
		{ isOver: boolean; canDrop: boolean }
	>(
		() => ({
			accept: MosaicDragType.WINDOW,
			canDrop: () => {
				const { draggingPaneId, draggingSourceTabId } =
					useDragPaneStore.getState();
				// Must have valid drag state AND be dropping on a different tab
				return (
					!!draggingPaneId &&
					!!draggingSourceTabId &&
					draggingSourceTabId !== tab.id
				);
			},
			drop: () => {
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
		[onPaneDrop, tab.id],
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
				drop(node);
			}}
			className={cn(
				"group relative flex items-center shrink-0 h-full border-r border-border",
				isOver && canDrop && "bg-primary/5",
			)}
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
						<span>{displayName}</span>
						<span className="text-muted-foreground ml-1.5">
							Double-click to rename
						</span>
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
