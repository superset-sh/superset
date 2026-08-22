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
import {
	LuBuilding2,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";

export interface ProjectMoveTargetOrganization {
	id: string;
	name: string;
}

interface DashboardSidebarProjectContextMenuProps {
	onCreateSection: () => void;
	onImportWorktrees: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	/** Organizations the user belongs to, excluding the active one. */
	moveTargetOrganizations: ProjectMoveTargetOrganization[];
	onMoveToOrganization: (organizationId: string) => void;
	isMovingToOrganization: boolean;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	onCreateSection,
	onImportWorktrees,
	onOpenInFinder,
	onOpenSettings,
	onRemoveFromSidebar,
	onRename,
	moveTargetOrganizations,
	onMoveToOrganization,
	isMovingToOrganization,
	children,
}: DashboardSidebarProjectContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" />
					Open in Finder
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSettings}>
					<LuSettings className="size-4 mr-2" />
					Project Settings
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					New group
				</ContextMenuItem>
				{moveTargetOrganizations.length > 0 && (
					<>
						<ContextMenuSeparator />
						<ContextMenuSub>
							<ContextMenuSubTrigger
								disabled={isMovingToOrganization}
								className="data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
							>
								<LuBuilding2 className="size-4 mr-2" />
								Move to organization
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="max-h-80 w-52 overflow-y-auto">
								{moveTargetOrganizations.map((organization) => (
									<ContextMenuItem
										key={organization.id}
										onSelect={() => onMoveToOrganization(organization.id)}
									>
										<span className="truncate">{organization.name}</span>
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					</>
				)}
				<ContextMenuItem onSelect={onImportWorktrees}>
					<LuFolderInput className="size-4 mr-2" />
					Import untracked worktrees
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onRemoveFromSidebar}>
					<LuX className="size-4 mr-2" />
					Remove from Sidebar
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
