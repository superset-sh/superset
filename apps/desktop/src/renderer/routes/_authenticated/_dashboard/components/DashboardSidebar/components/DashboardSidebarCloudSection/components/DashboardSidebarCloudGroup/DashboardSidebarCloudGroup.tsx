import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { type ReactNode, useEffect, useState } from "react";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import {
	type CloudSidebarGroup,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { DashboardSidebarGroupHeader } from "../../../DashboardSidebarGroupHeader";

interface DashboardSidebarCloudGroupProps {
	group: CloudSidebarGroup;
	organizationId: string;
	startRenaming: boolean;
	onRenameStarted: () => void;
	children: ReactNode;
}

export function DashboardSidebarCloudGroup({
	group,
	organizationId,
	startRenaming,
	onRenameStarted,
	children,
}: DashboardSidebarCloudGroupProps) {
	const renameGroup = useCloudSidebarStore((state) => state.renameGroup);
	const deleteGroup = useCloudSidebarStore((state) => state.deleteGroup);
	const toggleGroupCollapsed = useCloudSidebarStore(
		(state) => state.toggleGroupCollapsed,
	);
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(group.name);

	const beginRename = () => {
		setRenameValue(group.name);
		setIsRenaming(true);
	};

	useEffect(() => {
		if (!startRenaming) return;
		setRenameValue(group.name);
		setIsRenaming(true);
		onRenameStarted();
	}, [startRenaming, group.name, onRenameStarted]);

	return (
		<div style={{ boxShadow: "inset 2px 0 var(--color-border)" }}>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<DashboardSidebarGroupHeader
						indentation="top-level"
						isCollapsed={group.isCollapsed}
						isEditing={isRenaming}
						onToggleCollapse={() =>
							toggleGroupCollapsed(organizationId, group.id)
						}
						label={
							isRenaming ? (
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={() => {
										const name = renameValue.trim();
										if (name) renameGroup(organizationId, group.id, name);
										setIsRenaming(false);
									}}
									onCancel={() => setIsRenaming(false)}
									className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium text-muted-foreground outline-none"
								/>
							) : (
								<span className="truncate">{group.name}</span>
							)
						}
					/>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={beginRename}>
						<LuPencil />
						<Trans>Rename group</Trans>
					</ContextMenuItem>
					<ContextMenuItem
						variant="destructive"
						onSelect={() => deleteGroup(organizationId, group.id)}
					>
						<LuTrash2 />
						<Trans>Delete group</Trans>
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			{!group.isCollapsed && children}
		</div>
	);
}
