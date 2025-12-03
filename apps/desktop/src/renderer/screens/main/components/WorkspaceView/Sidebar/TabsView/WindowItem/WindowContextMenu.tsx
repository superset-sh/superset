import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type React from "react";

interface WindowContextMenuProps {
	onClose: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function WindowContextMenu({
	onClose,
	onRename,
	children,
}: WindowContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onSelect={onRename}>Rename Window</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onClose} className="text-destructive">
					Close Window
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
