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
	hasParent?: boolean;
	onClose: () => void;
	onRename: () => void;
	onDuplicate?: () => void;
	onUngroup?: () => void;
	onMoveOutOfGroup?: () => void;
}

export function TabContextMenu({
	children,
	tabType,
	hasParent = false,
	onClose,
	onRename,
	onDuplicate,
	onUngroup,
	onMoveOutOfGroup,
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
					</>
				) : (
					<>
						<ContextMenuItem onSelect={onRename}>Rename Tab</ContextMenuItem>
						{onDuplicate && (
							<ContextMenuItem onSelect={onDuplicate}>
								Duplicate Tab
							</ContextMenuItem>
						)}
						{hasParent && onMoveOutOfGroup && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem onSelect={onMoveOutOfGroup}>
									Move Out of Group
								</ContextMenuItem>
							</>
						)}
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
