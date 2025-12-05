import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Columns2, Rows2, X } from "lucide-react";
import type { ReactNode } from "react";

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane?: () => void;
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
					<Rows2 className="size-4" />
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={onSplitVertical}>
					<Columns2 className="size-4" />
					Split Vertically
				</ContextMenuItem>
				{onClosePane && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive" onSelect={onClosePane}>
							<X className="size-4" />
							Close Pane
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
