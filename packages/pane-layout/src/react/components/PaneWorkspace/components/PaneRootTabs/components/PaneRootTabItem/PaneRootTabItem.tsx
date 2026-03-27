import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PencilIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../../../core/store";
import type { PaneRootState } from "../../../../../../../types";
import { RootRenameInput } from "./components/RootRenameInput";

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
				<div className="group relative flex h-full w-full items-center border-r border-border">
					{isEditing ? (
						<div className="flex h-full w-full shrink-0 items-center px-2">
							<RootRenameInput
								className="text-sm w-full min-w-0 rounded border border-border bg-background px-1 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-ring"
								maxLength={64}
								onCancel={stopEditing}
								onChange={setEditValue}
								onSubmit={saveEdit}
								value={editValue}
							/>
						</div>
					) : (
						<>
							<Tooltip delayDuration={500}>
								<TooltipTrigger asChild>
									<button
										className={cn(
											"flex h-full w-full shrink-0 items-center gap-2 pl-3 pr-8 text-left text-sm transition-all",
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
				<ContextMenuItem onSelect={startEditing}>
					<PencilIcon className="mr-2 size-4" />
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={handleClose}>
					<XIcon className="mr-2 size-4" />
					Close
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
