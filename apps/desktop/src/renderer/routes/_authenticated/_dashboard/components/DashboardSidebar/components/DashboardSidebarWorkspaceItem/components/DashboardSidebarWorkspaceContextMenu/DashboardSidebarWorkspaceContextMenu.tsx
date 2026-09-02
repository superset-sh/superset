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
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuBellOff,
	LuBox,
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
import { useProjectTagFolderSections } from "../../../../hooks/useProjectTagFolderSections";
import { useDashboardSidebarHoverActions } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";

interface DashboardSidebarWorkspaceContextMenuProps {
	workspaceId: string;
	/** Null for project-less session workspaces. */
	projectId: string | null;
	/**
	 * Cloud rows are project-less too, so a null `projectId` alone does not mean
	 * "session". Only sessions and project workspaces can join a group.
	 */
	isSessionWorkspace?: boolean;
	isInSection?: boolean;
	isLocalWorkspace: boolean;
	isLocalMainWorkspace?: boolean;
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
	onRemoveFromSidebar: () => void;
	onRename?: () => void;
	/** Cloud workspaces only: turn this sandbox into a reusable environment. */
	onPromoteToEnvironment?: () => void;
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
	isLocalMainWorkspace = false,
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
	onPromoteToEnvironment,
	onDelete,
	onToggleUnread,
	onClearStatus,
	onRemovePullRequest,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
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
	const { sections } = useProjectTagFolderSections(projectId);
	const canJoinGroup = projectId !== null || isSessionWorkspace;
	const handleCloseAllPorts = () => {
		if (isKillingPorts) return;
		void killPorts(ports);
	};

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
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
				<ContextMenuSeparator />
				{onRename && (
					<ContextMenuItem onSelect={onRename}>
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
				{onPromoteToEnvironment && (
					<>
						<ContextMenuItem onSelect={onPromoteToEnvironment}>
							<LuBox className="h-4 w-4" />
							<Trans>Save as environment</Trans>
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
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
				{hasStatus && (
					<ContextMenuItem onSelect={onClearStatus}>
						<LuBellOff className="size-4 mr-2" />
						<Trans>Clear Status</Trans>
					</ContextMenuItem>
				)}
				{hasPullRequest && (
					<ContextMenuItem onSelect={onRemovePullRequest}>
						<LuUnlink className="size-4 mr-2" />
						<Trans>Remove PR Link</Trans>
					</ContextMenuItem>
				)}
				{/* Group actions mutate placement (sectionId/tabOrder), which a pinned
				    row doesn't display — the change would only surface on unpin.
				    Cloud rows are project-less but ungroupable: they stay in the Cloud
				    section, so grouping them would write tags with nothing to show. */}
				{!isPinned && !isLocalMainWorkspace && canJoinGroup && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onCreateSection}>
							<LuFolderPlus className="size-4 mr-2" />
							<Trans>New group from workspace</Trans>
						</ContextMenuItem>
						{(sections.length > 0 || isInSection) && <ContextMenuSeparator />}
						{sections.length > 0 && (
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
				<ContextMenuItem onSelect={onRemoveFromSidebar}>
					<LuX className="size-4 mr-2" />
					<Trans>Remove from Sidebar</Trans>
				</ContextMenuItem>
				{onDelete ? (
					<ContextMenuItem
						onSelect={onDelete}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						<Trans>Delete</Trans>
						{showDeleteShortcut && (
							<ContextMenuShortcut>{deleteHotkeyText}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
