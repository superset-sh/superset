import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import { TabType } from "renderer/stores/tabs/types";

interface TabContextMenuProps {
	children: ReactNode;
	tabId: string;
	tabType: TabType;
	onClose?: () => void;
	onRename?: () => void;
	onDuplicate?: () => void;
	onMoveToNewWindow?: () => void;
	onUngroup?: () => void;
	onDeleteGroup?: () => void;
}

export function TabContextMenu({
	children,
	tabType,
	onClose,
	onRename,
	onDuplicate,
	onMoveToNewWindow,
	onUngroup,
	onDeleteGroup,
}: TabContextMenuProps) {
	const isGroupTab = tabType === TabType.Group;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{isGroupTab ? (
					<>
						<ContextMenuItem onSelect={onRename}>Rename Group</ContextMenuItem>
						<ContextMenuItem onSelect={onUngroup}>Ungroup Tabs</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onDuplicate}>
							Duplicate Group
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive" onSelect={onDeleteGroup}>
							Delete Group
						</ContextMenuItem>
					</>
				) : (
					<>
						<ContextMenuItem onSelect={onRename}>Rename Tab</ContextMenuItem>
						<ContextMenuItem onSelect={onDuplicate}>
							Duplicate Tab
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onMoveToNewWindow}>
							Move to New Window
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive" onSelect={onClose}>
							Close Tab
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
