import { SESSIONS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { type ReactNode, useEffect, useState } from "react";
import { buildSidebarFolderKey } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { DashboardSidebarGroupHeader } from "../../../DashboardSidebarGroupHeader";
import { DashboardSidebarSectionContextMenu } from "../../../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu";
import { DashboardSidebarSectionActionsDropdown } from "../../../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu/components/DashboardSidebarSectionActionsDropdown";
import { useDashboardSidebarSectionRename } from "../../../DashboardSidebarSectionRenameContext";

interface DashboardSidebarSessionTagGroupProps {
	tag: string;
	name: string;
	color: string | null;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	onDelete: (sectionId: string) => void;
	onRename: (sectionId: string, name: string) => void;
	onSetColor: (sectionId: string, color: string | null) => void;
	children: ReactNode;
}

/** A derived tag lane inside Sessions, styled like project tag folders. */
export function DashboardSidebarSessionTagGroup({
	tag,
	name,
	color,
	isCollapsed,
	onToggleCollapse,
	onDelete,
	onRename,
	onSetColor,
	children,
}: DashboardSidebarSessionTagGroupProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(name);
	const { pendingRenameSectionId, clearPendingSectionRename } =
		useDashboardSidebarSectionRename();
	const renameKey = buildSidebarFolderKey(SESSIONS_TAG_SCOPE, tag);
	useEffect(() => {
		if (pendingRenameSectionId !== renameKey) return;
		setRenameValue(name);
		setIsRenaming(true);
		clearPendingSectionRename(renameKey);
	}, [pendingRenameSectionId, renameKey, name, clearPendingSectionRename]);
	const startRename = () => {
		setRenameValue(name);
		setIsRenaming(true);
	};
	const submitRename = () => {
		const nextName = renameValue.trim();
		setIsRenaming(false);
		if (!nextName || nextName === name) return;
		onRename(renameKey, nextName);
	};
	const cancelRename = () => {
		setRenameValue(name);
		setIsRenaming(false);
	};
	const actions = (
		<DashboardSidebarSectionActionsDropdown
			color={color}
			onRename={startRename}
			onSetColor={(color) => onSetColor(renameKey, color)}
			onDelete={() => onDelete(renameKey)}
		/>
	);

	return (
		<div>
			<div
				className="border-l-2"
				style={{ borderColor: color ?? "var(--color-border)" }}
			>
				<DashboardSidebarSectionContextMenu
					color={color}
					onRename={startRename}
					onSetColor={(color) => onSetColor(renameKey, color)}
					onDelete={() => onDelete(renameKey)}
				>
					<DashboardSidebarGroupHeader
						label={
							isRenaming ? (
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={submitRename}
									onCancel={cancelRename}
									className="-ml-1 h-5 w-full min-w-0 border-none bg-transparent px-1 py-0 text-[13px] font-medium text-muted-foreground outline-none"
								/>
							) : (
								<span className="truncate">{name}</span>
							)
						}
						isCollapsed={isCollapsed}
						isEditing={isRenaming}
						onToggleCollapse={onToggleCollapse}
						actions={actions}
					/>
				</DashboardSidebarSectionContextMenu>
			</div>
			{!isCollapsed && children}
		</div>
	);
}
