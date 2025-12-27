import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type React from "react";

interface TabContextMenuProps {
	paneCount: number;
	onClose: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function TabContextMenu({
	paneCount,
	onClose,
	onRename,
	children,
}: TabContextMenuProps) {
	const hasMultiplePanes = paneCount > 1;

	const contextMenuContent = (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onSelect={onRename}>Rename Tab</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onClose} className="text-destructive">
					Close Tab
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);

	if (!hasMultiplePanes) {
		return contextMenuContent;
	}

	return (
		<Tooltip delayDuration={400}>
			<ContextMenu>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</TooltipTrigger>
				<ContextMenuContent className="w-48">
					<ContextMenuItem onSelect={onRename}>Rename Tab</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={onClose} className="text-destructive">
						Close Tab
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<TooltipContent side="right" showArrow={false} className="max-w-xs">
				<div className="text-xs">{paneCount} terminals</div>
			</TooltipContent>
		</Tooltip>
	);
}
