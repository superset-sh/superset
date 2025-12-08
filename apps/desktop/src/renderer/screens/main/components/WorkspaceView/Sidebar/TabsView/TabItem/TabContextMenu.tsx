import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type React from "react";

interface TabContextMenuProps {
	onClose: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function TabContextMenu({
	onClose,
	onRename,
	children,
}: TabContextMenuProps) {
	return (
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
}
