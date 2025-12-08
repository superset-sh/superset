import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type React from "react";

interface PresetContextMenuProps {
	onDelete: () => void;
	children: React.ReactNode;
}

export function PresetContextMenu({
	onDelete,
	children,
}: PresetContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onSelect={onDelete} className="text-destructive">
					Delete Preset
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
