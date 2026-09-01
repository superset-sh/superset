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
import { HiCheck } from "react-icons/hi2";
import {
	LuEye,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuFolders,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { DashboardSidebarCollection } from "../../../../types";
import { hasCustomColor } from "../../../../utils/collectionColor";

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
	onCreateSection: () => void;
	onImportWorktrees: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	/** Folders available to move this project into. */
	collections: DashboardSidebarCollection[];
	/** Folder the project currently sits in, or null when at the root. */
	currentCollectionId: string | null;
	onMoveToCollection: (collectionId: string | null) => void;
	onCreateCollectionWithProject: () => void;
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
	collections,
	currentCollectionId,
	onMoveToCollection,
	onCreateCollectionWithProject,
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
				{/* "workspace group" and "collection" sit two items apart here, so both
				    labels name the level they act on. LuFolderPlus is the workspace
				    level, LuFolders the project level. */}
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					<Trans id="dashboard.sidebar.projectMenu.newGroup">New group</Trans>
				</ContextMenuItem>
				{hiddenTags.length > 0 ? (
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuEye className="size-4 mr-2" />
							<Trans id="dashboard.sidebar.projectMenu.hiddenFolders">
								Hidden collections
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
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuFolders className="size-4 mr-2" />
						<Trans id="dashboard.sidebar.projectMenu.moveToCollection">
							Move to collection
						</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="max-h-80 w-48 overflow-y-auto">
						<ContextMenuItem onSelect={onCreateCollectionWithProject}>
							<LuFolders className="size-4 mr-2" />
							<Trans id="dashboard.sidebar.projectMenu.newCollection">
								New collection…
							</Trans>
						</ContextMenuItem>
						{collections.length > 0 && <ContextMenuSeparator />}
						{collections.map((collection) => {
							const hasColor = hasCustomColor(collection.color);
							return (
								<ContextMenuItem
									key={collection.id}
									onSelect={() => onMoveToCollection(collection.id)}
								>
									<span
										className="mr-2 size-3 shrink-0 rounded-full border border-border"
										style={{
											backgroundColor: hasColor
												? (collection.color ?? undefined)
												: "transparent",
										}}
									/>
									<span className="flex-1 truncate">{collection.name}</span>
									{currentCollectionId === collection.id && (
										<HiCheck className="size-4 text-primary" />
									)}
								</ContextMenuItem>
							);
						})}
						{currentCollectionId !== null && (
							<>
								<ContextMenuSeparator />
								<ContextMenuItem onSelect={() => onMoveToCollection(null)}>
									<LuX className="size-4 mr-2" />
									<Trans id="dashboard.sidebar.projectMenu.removeFromCollection">
										Remove from collection
									</Trans>
								</ContextMenuItem>
							</>
						)}
					</ContextMenuSubContent>
				</ContextMenuSub>
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
