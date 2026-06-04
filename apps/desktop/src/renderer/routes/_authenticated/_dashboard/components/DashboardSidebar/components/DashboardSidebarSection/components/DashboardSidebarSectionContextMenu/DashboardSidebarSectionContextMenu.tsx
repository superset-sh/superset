import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { SectionActionsMenuItems } from "./components/SectionActionsMenuItems";
import type { DashboardSidebarSectionActionsProps } from "./types";

interface DashboardSidebarSectionContextMenuProps
	extends DashboardSidebarSectionActionsProps {
	children: React.ReactNode;
}

export function DashboardSidebarSectionContextMenu({
	color,
	onRename,
	onSetColor,
	onDelete,
	children,
}: DashboardSidebarSectionContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent
				onCloseAutoFocus={(event) => event.preventDefault()}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<SectionActionsMenuItems
					color={color}
					kind="context"
					onRename={onRename}
					onSetColor={onSetColor}
					onDelete={onDelete}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}
