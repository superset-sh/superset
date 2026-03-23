import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../../../core/store";
import type { PaneRootState } from "../../../../../../../types";

interface PaneRootTabItemProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	root: PaneRootState<TPaneData>;
	isActive: boolean;
	onSelect: () => void;
	getRootTitle?: (root: PaneRootState<TPaneData>) => ReactNode;
}

export function PaneRootTabItem<TPaneData>({
	store,
	root,
	isActive,
	onSelect,
	getRootTitle,
}: PaneRootTabItemProps<TPaneData>) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const resolvedTitle = root.titleOverride ?? getRootTitle?.(root) ?? root.id;

	const startEditing = () => {
		setEditValue(typeof resolvedTitle === "string" ? resolvedTitle : root.id);
		setIsEditing(true);
	};

	const stopEditing = () => {
		setIsEditing(false);
	};

	const saveEdit = () => {
		const nextTitle = editValue.trim();
		store.getState().setRootTitleOverride({
			rootId: root.id,
			titleOverride: nextTitle.length > 0 ? nextTitle : undefined,
		});
		stopEditing();
	};

	const handleClose = () => {
		store.getState().removeRoot(root.id);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="group relative flex h-full shrink-0 border-r border-border">
					{isEditing ? (
						<div className="flex h-full w-[160px] items-center px-2">
							<Input
								autoFocus
								className="h-7"
								onBlur={saveEdit}
								onChange={(event) => setEditValue(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										saveEdit();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										stopEditing();
									}
								}}
								value={editValue}
							/>
						</div>
					) : (
						<>
							<Tooltip delayDuration={500}>
								<TooltipTrigger asChild>
									<button
										className={cn(
											"flex h-full w-[160px] shrink-0 items-center gap-2 pl-3 pr-8 text-left text-sm transition-all",
											isActive
												? "bg-border/30 text-foreground"
												: "text-muted-foreground/70 hover:bg-tertiary/20 hover:text-muted-foreground",
										)}
										onAuxClick={(event) => {
											if (event.button === 1) {
												event.preventDefault();
												handleClose();
											}
										}}
										onClick={onSelect}
										onDoubleClick={startEditing}
										type="button"
									>
										<span className="flex-1 truncate">{resolvedTitle}</span>
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{resolvedTitle}
								</TooltipContent>
							</Tooltip>
							<div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
								<Tooltip delayDuration={500}>
									<TooltipTrigger asChild>
										<Button
											className="size-6 cursor-pointer hover:bg-muted"
											onClick={(event) => {
												event.stopPropagation();
												handleClose();
											}}
											size="icon-xs"
											type="button"
											variant="ghost"
										>
											<XIcon className="size-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" showArrow={false}>
										Close
									</TooltipContent>
								</Tooltip>
							</div>
						</>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={startEditing}>Rename</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={handleClose}>Close</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
