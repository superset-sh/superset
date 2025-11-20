import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
}

export function TabContentContextMenu({
	children,
	onSplitHorizontal,
	onSplitVertical,
	onClosePane,
}: TabContentContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onSplitHorizontal}>
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={onSplitVertical}>
					Split Vertically
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive" onSelect={onClosePane}>
					Close Pane
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
