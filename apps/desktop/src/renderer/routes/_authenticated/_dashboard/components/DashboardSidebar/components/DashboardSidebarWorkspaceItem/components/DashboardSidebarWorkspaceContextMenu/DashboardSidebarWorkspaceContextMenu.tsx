import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuPencil,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardSidebarHover } from "../../../../providers/DashboardSidebarHoverProvider";

interface DashboardSidebarWorkspaceContextMenuProps {
	projectId: string;
	isInSection?: boolean;
	isLocalWorkspace: boolean;
	isUnread: boolean;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	onDelete?: () => void;
	onToggleUnread: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	projectId,
	isInSection,
	isLocalWorkspace,
	isUnread,
	onCreateSection,
	onMoveToSection,
	onOpenInFinder,
	onCopyPath,
	onCopyBranchName,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	onToggleUnread,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
	const collections = useCollections();
	const { setContextMenuOpen } = useDashboardSidebarHover();
	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.where(({ sidebarSections }) =>
					eq(sidebarSections.projectId, projectId),
				)
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					name: sidebarSections.name,
					color: sidebarSections.color,
				})),
		[collections, projectId],
	);

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				{isLocalWorkspace && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onOpenInFinder}>
							<LuFolderOpen className="size-4 mr-2" />
							Open in Finder
						</ContextMenuItem>
						<ContextMenuItem onSelect={onCopyPath}>
							<LuCopy className="size-4 mr-2" />
							Copy Path
						</ContextMenuItem>
					</>
				)}
				{!isLocalWorkspace && <ContextMenuSeparator />}
				<ContextMenuItem onSelect={onCopyBranchName}>
					<LuGitBranch className="size-4 mr-2" />
					Copy Branch Name
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onToggleUnread}>
					{isUnread ? (
						<>
							<LuEye className="size-4 mr-2" />
							Mark as Read
						</>
					) : (
						<>
							<LuEyeOff className="size-4 mr-2" />
							Mark as Unread
						</>
					)}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					New group from workspace
				</ContextMenuItem>
				{(sections.length > 0 || isInSection) && <ContextMenuSeparator />}
				{sections.length > 0 && (
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuArrowRightLeft className="size-4 mr-2" />
							Move to group
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
						Ungroup
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2 text-destructive" />
					Remove from Sidebar
				</ContextMenuItem>
				{onDelete ? (
					<ContextMenuItem
						onSelect={onDelete}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						Delete
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
