import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type React from "react";

interface PresetContextMenuProps {
	hasActiveTab: boolean;
	tooltipText?: string;
	onOpenAsNewTab: () => void;
	onOpenAsPane: () => void;
	children: React.ReactNode;
}

export function PresetContextMenu({
	hasActiveTab,
	tooltipText,
	onOpenAsNewTab,
	onOpenAsPane,
	children,
}: PresetContextMenuProps) {
	const contextMenuContent = (
		<ContextMenuContent className="w-56">
			<ContextMenuItem onSelect={onOpenAsNewTab}>
				Open as New Tab
			</ContextMenuItem>
			{hasActiveTab && (
				<>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={onOpenAsPane}>
						Open as Pane in Current Tab
					</ContextMenuItem>
				</>
			)}
		</ContextMenuContent>
	);

	if (!tooltipText) {
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				{contextMenuContent}
			</ContextMenu>
		);
	}

	return (
		<Tooltip delayDuration={300}>
			<ContextMenu>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</TooltipTrigger>
				{contextMenuContent}
			</ContextMenu>
			<TooltipContent side="right">{tooltipText}</TooltipContent>
		</Tooltip>
	);
}
