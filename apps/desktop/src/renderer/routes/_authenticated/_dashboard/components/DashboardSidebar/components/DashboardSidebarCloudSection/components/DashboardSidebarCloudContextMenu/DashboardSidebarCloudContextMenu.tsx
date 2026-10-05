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
import type { KeyboardEvent, ReactNode } from "react";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
	LuArchive,
	LuArrowRightLeft,
	LuArrowUp,
	LuArrowUpRight,
	LuBox,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderPlus,
	LuHash,
	LuPanelLeftClose,
	LuPencil,
	LuRadioTower,
	LuTag,
} from "react-icons/lu";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { LabelCommand } from "renderer/routes/_authenticated/_dashboard/components/LabelCommand";
import { ProjectCommand } from "renderer/routes/_authenticated/_dashboard/components/ProjectCommand";
import { ProjectGlyph } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import type { CloudSidebarGroup } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useRunAfterMenuClose } from "../../../../hooks/useRunAfterMenuClose";
import { LinkTaskCommand } from "./components/LinkTaskCommand";

interface LabelOption {
	id: string;
	name: string;
	color: string | null;
}

interface ProjectOption {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

/** The menu's typeahead and arrow keys would otherwise steal keystrokes from a submenu's search field. */
function keepKeysInSearch(event: KeyboardEvent) {
	if (event.key !== "Escape") event.stopPropagation();
}

interface DashboardSidebarCloudContextMenuProps {
	projectId: string | null;
	projects: ProjectOption[];
	linkedTaskIds: ReadonlySet<string>;
	labels: LabelOption[];
	knownLabels: LabelOption[];
	isUnread: boolean;
	groups: Pick<CloudSidebarGroup, "id" | "name">[];
	groupId: string | null;
	archiveShortcut: string | null;
	isClosingPorts?: boolean;
	onOpenChange?: (open: boolean) => void;
	onOpenDetails: () => void;
	onRename?: () => void;
	onSaveAsEnvironment?: () => void;
	onSetProject: (projectId: string | null) => void;
	onToggleTask: (task: CloudTask, isLinked: boolean) => void;
	onAddLabel: (name: string) => void;
	onRemoveLabel: (labelId: string) => void;
	onCopyLink: () => void;
	onCopyWorkspaceId: () => void;
	onToggleUnread?: () => void;
	onCreateGroup: () => void;
	onMoveToGroup: (groupId: string | null) => void;
	onCloseAllPorts?: () => void;
	onHideFromSidebar?: () => void;
	onArchive?: () => void;
	children: ReactNode;
}

export function DashboardSidebarCloudContextMenu({
	projectId,
	projects,
	linkedTaskIds,
	labels,
	knownLabels,
	isUnread,
	groups,
	groupId,
	archiveShortcut,
	isClosingPorts = false,
	onOpenChange,
	onOpenDetails,
	onRename,
	onSaveAsEnvironment,
	onSetProject,
	onToggleTask,
	onAddLabel,
	onRemoveLabel,
	onCopyLink,
	onCopyWorkspaceId,
	onToggleUnread,
	onCreateGroup,
	onMoveToGroup,
	onCloseAllPorts,
	onHideFromSidebar,
	onArchive,
	children,
}: DashboardSidebarCloudContextMenuProps) {
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	return (
		<ContextMenu onOpenChange={onOpenChange}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
				<ContextMenuItem onSelect={onOpenDetails}>
					<LuArrowUpRight />
					<Trans>Open details</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				{onRename && (
					<ContextMenuItem onSelect={() => runAfterClose(onRename)}>
						<LuPencil />
						<Trans>Rename</Trans>
					</ContextMenuItem>
				)}
				{onSaveAsEnvironment && (
					<ContextMenuItem onSelect={onSaveAsEnvironment}>
						<LuBox />
						<Trans>Save as environment</Trans>
					</ContextMenuItem>
				)}
				{(onRename || onSaveAsEnvironment) && <ContextMenuSeparator />}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<Trans>Copy</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem onSelect={onCopyLink}>
							<LuCopy />
							<Trans>Link</Trans>
						</ContextMenuItem>
						<ContextMenuItem onSelect={onCopyWorkspaceId}>
							<LuHash />
							<Trans>Workspace ID</Trans>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				{onToggleUnread && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onToggleUnread}>
							{isUnread ? <LuEye /> : <LuEyeOff />}
							{isUnread ? (
								<Trans>Mark as Read</Trans>
							) : (
								<Trans>Mark as Unread</Trans>
							)}
						</ContextMenuItem>
					</>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => runAfterClose(onCreateGroup)}>
					<LuFolderPlus />
					<Trans>New group from workspace</Trans>
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuArrowRightLeft />
						<Trans>Move to group</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{groups
							.filter((group) => group.id !== groupId)
							.map((group) => (
								<ContextMenuItem
									key={group.id}
									onSelect={() => onMoveToGroup(group.id)}
								>
									{group.name}
								</ContextMenuItem>
							))}
						{groups.some((group) => group.id !== groupId) && (
							<ContextMenuSeparator />
						)}
						<ContextMenuItem onSelect={() => runAfterClose(onCreateGroup)}>
							<LuFolderPlus />
							<Trans>Create new group</Trans>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				{groupId && (
					<ContextMenuItem onSelect={() => onMoveToGroup(null)}>
						<LuArrowUp />
						<Trans>Ungroup</Trans>
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<HiOutlineClipboardDocumentList />
						<Trans>Add task</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-80 p-0">
						<LinkTaskCommand
							linkedTaskIds={linkedTaskIds}
							onToggle={onToggleTask}
							onKeyDown={keepKeysInSearch}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<ProjectGlyph />
						<Trans>Add to project</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-64 p-0">
						<ProjectCommand
							projectId={projectId}
							projects={projects}
							onSelect={onSetProject}
							onKeyDown={keepKeysInSearch}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuTag />
						<Trans>Add label</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-64 p-0">
						<LabelCommand
							labels={labels}
							knownLabels={knownLabels}
							onAdd={onAddLabel}
							onRemove={onRemoveLabel}
							onKeyDown={keepKeysInSearch}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				{onCloseAllPorts && (
					<ContextMenuItem
						variant="destructive"
						disabled={isClosingPorts}
						onSelect={onCloseAllPorts}
					>
						<LuRadioTower />
						<Trans>Close all ports</Trans>
					</ContextMenuItem>
				)}
				{onHideFromSidebar && (
					<ContextMenuItem onSelect={onHideFromSidebar}>
						<LuPanelLeftClose />
						<Trans>Hide from Sidebar</Trans>
					</ContextMenuItem>
				)}
				{onArchive && (
					<ContextMenuItem onSelect={onArchive}>
						<LuArchive />
						<Trans>Archive</Trans>
						{archiveShortcut && (
							<ContextMenuShortcut>{archiveShortcut}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
