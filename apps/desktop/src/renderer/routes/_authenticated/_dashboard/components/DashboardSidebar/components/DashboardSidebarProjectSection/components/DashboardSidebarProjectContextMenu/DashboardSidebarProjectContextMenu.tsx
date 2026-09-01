import { Trans } from "@lingui/react/macro";
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
	LuEye,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";

export interface ProjectMoveTargetOrganization {
	id: string;
	name: string;
}

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
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
	projectId,
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
	const { preferences, setTagFolderHidden } = useV2UserPreferences();
	const hiddenTags = preferences.hiddenTagFolders[projectId] ?? [];
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.rename">Rename</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.openInFinder">
						Open in Finder
					</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSettings}>
					<LuSettings className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.projectSettings">
						Project Settings
					</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.newGroup">New group</Trans>
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
								<Trans id="dashboard.sidebar.projectMenu.moveToOrganization">
									Move to organization
								</Trans>
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
				{hiddenTags.length > 0 ? (
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuEye className="size-4 mr-2" />
							<Trans id="dashboard.sidebar.projectMenu.hiddenFolders">
								Hidden folders
							</Trans>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-48 max-h-80 overflow-y-auto">
							{hiddenTags.map((tag) => (
								<ContextMenuItem
									key={tag}
									onSelect={() => setTagFolderHidden(projectId, tag, false)}
								>
									{tag}
								</ContextMenuItem>
							))}
						</ContextMenuSubContent>
					</ContextMenuSub>
				) : null}
				<ContextMenuItem onSelect={onImportWorktrees}>
					<LuFolderInput className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.importWorktrees">
						Import untracked worktrees
					</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onRemoveFromSidebar}>
					<LuX className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.removeFromSidebar">
						Remove from Sidebar
					</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
