import { Trans } from "@lingui/react/macro";
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
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import {
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
import { useDashboardSidebarPortKill } from "../../../../hooks/useDashboardSidebarPortKill";
import { useDashboardSidebarHoverActions } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { WorkspaceMoveToGroupItems } from "./components/WorkspaceMoveToGroupItems";

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
	 * than deleted. Its folder membership is a tag the API keeps, so it groups
	 * like any other row.
	 */
	isCloudWorkspace?: boolean;
	isPinned: boolean;
	isUnread: boolean;
	hasStatus: boolean;
	hasPullRequest: boolean;
	showDeleteHotkey?: boolean;
	onTogglePin: () => void;
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
	isUnread,
	hasStatus,
	hasPullRequest,
	showDeleteHotkey = false,
	onTogglePin,
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
				{!isPinned && canJoinGroup && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onCreateSection}>
							<LuFolderPlus className="size-4 mr-2" />
							<Trans>New group from workspace</Trans>
						</ContextMenuItem>
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<LuArrowRightLeft className="size-4 mr-2" />
								<Trans>Move to group</Trans>
							</ContextMenuSubTrigger>
							<ContextMenuSubContent>
								<WorkspaceMoveToGroupItems
									projectId={projectId}
									onMoveToSection={onMoveToSection}
									onCreateSection={onCreateSection}
								/>
							</ContextMenuSubContent>
						</ContextMenuSub>
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
