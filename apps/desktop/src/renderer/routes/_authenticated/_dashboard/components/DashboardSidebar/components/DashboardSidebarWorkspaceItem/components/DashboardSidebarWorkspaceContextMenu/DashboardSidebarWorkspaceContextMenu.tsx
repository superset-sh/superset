import { Trans } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	LuAlarmClockOff,
	LuArchive,
	LuArrowRightLeft,
	LuArrowUp,
	LuBellOff,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuHash,
	LuPencil,
	LuPin,
	LuPinOff,
	LuRadioTower,
	LuTrash2,
	LuUnlink,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { parseSidebarFolderKey } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { useDashboardSidebarPortKill } from "../../../../hooks/useDashboardSidebarPortKill";
import { useProjectTagFolderSections } from "../../../../hooks/useProjectTagFolderSections";
import { useRunAfterMenuClose } from "../../../../hooks/useRunAfterMenuClose";
import { useDashboardSidebarHoverActions } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { SnoozeSubmenu } from "./components/SnoozeSubmenu";

interface DashboardSidebarWorkspaceContextMenuProps {
	workspaceId: string;
	/** Null for project-less session workspaces. */
	projectId: string | null;
	/** Only sessions and project workspaces can join a group. */
	isSessionWorkspace?: boolean;
	isInSection?: boolean;
	isLocalWorkspace: boolean;
	/**
	 * A cloud workspace has no host bindings to clear and is archived rather
	 * than deleted. It pins and joins older folders through its placement row,
	 * but can't join a tag-backed folder (membership there is a host tag).
	 */
	isCloudWorkspace?: boolean;
	isPinned: boolean;
	/** Epoch ms the row wakes; null when it isn't snoozed. */
	snoozedUntil?: number | null;
	isUnread: boolean;
	hasStatus: boolean;
	hasPullRequest: boolean;
	showDeleteHotkey?: boolean;
	onTogglePin: () => void;
	onSnooze: (until: number) => void;
	onUnsnooze: () => void;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onCopyWorkspaceId: () => void;
	/** Absent when the row can't leave the sidebar (your own cloud workspace). */
	onRemoveFromSidebar?: () => void;
	onRename?: () => void;
	onDelete?: () => void;
	onToggleUnread: () => void;
	onClearStatus: () => void;
	onRemovePullRequest: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	workspaceId,
	projectId,
	isSessionWorkspace = false,
	isInSection,
	isLocalWorkspace,
	isCloudWorkspace = false,
	isPinned,
	snoozedUntil = null,
	isUnread,
	hasStatus,
	hasPullRequest,
	showDeleteHotkey = false,
	onTogglePin,
	onSnooze,
	onUnsnooze,
	onCreateSection,
	onMoveToSection,
	onOpenInFinder,
	onCopyPath,
	onCopyBranchName,
	onCopyWorkspaceId,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	onToggleUnread,
	onClearStatus,
	onRemovePullRequest,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const { setContextMenuOpen } = useDashboardSidebarHoverActions();
	const portGroup = useDashboardSidebarWorkspacePorts(workspaceId);
	const { isPending: isKillingPorts, killPorts } =
		useDashboardSidebarPortKill();
	const ports = portGroup?.ports ?? [];
	const deleteHotkeyText = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const showDeleteShortcut =
		showDeleteHotkey && deleteHotkeyText !== "Unassigned";
	// The derived union — a tag-only folder with no stored row is a valid
	// move target.
	const { sections: allSections } = useProjectTagFolderSections(projectId);
	// New groups are tag-backed, so a cloud row is offered only older folders.
	const sections = isCloudWorkspace
		? allSections.filter(
				(section) => parseSidebarFolderKey(section.id)?.tag == null,
			)
		: allSections;
	const canCreateGroup = !isCloudWorkspace;
	const canJoinGroup = projectId !== null || isSessionWorkspace;
	const handleCloseAllPorts = () => {
		if (isKillingPorts) return;
		void killPorts(ports);
	};

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
				<ContextMenuItem onSelect={onTogglePin}>
					{isPinned ? (
						<>
							<LuPinOff className="size-4 mr-2" />
							<Trans>Unpin</Trans>
						</>
					) : (
						<>
							<LuPin className="size-4 mr-2" />
							<Trans>Pin</Trans>
						</>
					)}
				</ContextMenuItem>
				{snoozedUntil === null ? (
					<SnoozeSubmenu onSnooze={onSnooze} />
				) : (
					<ContextMenuItem onSelect={onUnsnooze}>
						<LuAlarmClockOff className="size-4 mr-2" />
						<Trans>Unsnooze</Trans>
						<ContextMenuShortcut>
							{formatDateTime(snoozedUntil, {
								weekday: "short",
								hour: "numeric",
								minute: "2-digit",
							})}
						</ContextMenuShortcut>
					</ContextMenuItem>
				)}
				{onRename && (
					<ContextMenuItem onSelect={() => runAfterClose(onRename)}>
						<LuPencil className="size-4 mr-2" />
						<Trans>Rename</Trans>
					</ContextMenuItem>
				)}
				{isLocalWorkspace && (
					<>
						{onRename && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={onOpenInFinder}>
							<LuFolderOpen className="size-4 mr-2" />
							<Trans>Open in Finder</Trans>
						</ContextMenuItem>
						<ContextMenuItem onSelect={onCopyPath}>
							<LuCopy className="size-4 mr-2" />
							<Trans>Copy Path</Trans>
						</ContextMenuItem>
					</>
				)}
				{!isLocalWorkspace && onRename && <ContextMenuSeparator />}
				<ContextMenuItem onSelect={onCopyBranchName}>
					<LuGitBranch className="size-4 mr-2" />
					<Trans>Copy Branch Name</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCopyWorkspaceId}>
					<LuHash className="size-4 mr-2" />
					<Trans>Copy Workspace ID</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onToggleUnread}>
					{isUnread ? (
						<>
							<LuEye className="size-4 mr-2" />
							<Trans>Mark as Read</Trans>
						</>
					) : (
						<>
							<LuEyeOff className="size-4 mr-2" />
							<Trans>Mark as Unread</Trans>
						</>
					)}
				</ContextMenuItem>
				{hasStatus && !isCloudWorkspace && (
					<ContextMenuItem onSelect={onClearStatus}>
						<LuBellOff className="size-4 mr-2" />
						<Trans>Clear Status</Trans>
					</ContextMenuItem>
				)}
				{hasPullRequest && !isCloudWorkspace && (
					<ContextMenuItem onSelect={onRemovePullRequest}>
						<LuUnlink className="size-4 mr-2" />
						<Trans>Remove PR Link</Trans>
					</ContextMenuItem>
				)}
				{/* Group actions mutate placement (sectionId/tabOrder), which a pinned
				    row doesn't display — the change would only surface on unpin. */}
				{!isPinned &&
					canJoinGroup &&
					(canCreateGroup || sections.length > 0 || isInSection) && (
						<>
							<ContextMenuSeparator />
							{canCreateGroup && (
								<ContextMenuItem onSelect={onCreateSection}>
									<LuFolderPlus className="size-4 mr-2" />
									<Trans>New group from workspace</Trans>
								</ContextMenuItem>
							)}
							{(canCreateGroup || sections.length > 0) && (
								<ContextMenuSub>
									<ContextMenuSubTrigger>
										<LuArrowRightLeft className="size-4 mr-2" />
										<Trans>Move to group</Trans>
									</ContextMenuSubTrigger>
									<ContextMenuSubContent>
										{sections.map((section) => (
											<ContextMenuItem
												key={section.id}
												onSelect={() => onMoveToSection(section.id)}
											>
												{section.color && (
													<span
														className="size-2 shrink-0 rounded-full mr-2"
														style={{ backgroundColor: section.color }}
													/>
												)}
												{section.name}
											</ContextMenuItem>
										))}
										{canCreateGroup && sections.length > 0 && (
											<ContextMenuSeparator />
										)}
										{canCreateGroup && (
											<ContextMenuItem onSelect={onCreateSection}>
												<LuFolderPlus className="size-4 mr-2" />
												<Trans>Create new group</Trans>
											</ContextMenuItem>
										)}
									</ContextMenuSubContent>
								</ContextMenuSub>
							)}
							{isInSection && (
								<ContextMenuItem onSelect={() => onMoveToSection(null)}>
									<LuArrowUp className="size-4 mr-2" />
									<Trans>Ungroup</Trans>
								</ContextMenuItem>
							)}
						</>
					)}
				<ContextMenuSeparator />
				{ports.length > 0 && (
					<ContextMenuItem
						onSelect={handleCloseAllPorts}
						disabled={isKillingPorts}
						variant="destructive"
					>
						<LuRadioTower className="size-4 mr-2" />
						<Trans>Close all ports</Trans>
					</ContextMenuItem>
				)}
				{onRemoveFromSidebar && (
					<ContextMenuItem onSelect={onRemoveFromSidebar}>
						<LuX className="size-4 mr-2" />
						<Trans>Remove from Sidebar</Trans>
					</ContextMenuItem>
				)}
				{onDelete ? (
					<ContextMenuItem
						onSelect={onDelete}
						className="text-destructive focus:text-destructive"
					>
						{isCloudWorkspace ? (
							<>
								<LuArchive className="size-4 mr-2 text-destructive" />
								<Trans>Archive</Trans>
							</>
						) : (
							<>
								<LuTrash2 className="size-4 mr-2 text-destructive" />
								<Trans>Delete</Trans>
							</>
						)}
						{showDeleteShortcut && (
							<ContextMenuShortcut>{deleteHotkeyText}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
