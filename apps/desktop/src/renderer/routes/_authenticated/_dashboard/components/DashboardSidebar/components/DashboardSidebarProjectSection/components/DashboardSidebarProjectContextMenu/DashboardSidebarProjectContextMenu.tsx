import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	LuArrowRightLeft,
	LuEye,
	LuEyeOff,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuPencil,
	LuSettings,
	LuTrash2,
} from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useSidebarProjectCollections } from "../../../../providers/DashboardSidebarProjectCollectionsProvider";

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
	onCreateSection: () => void;
	onImportWorktrees: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onHide: () => void;
	/** Null when the user cannot delete (not an organization owner). */
	onDelete: (() => void) | null;
	onRename: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	projectId,
	onCreateSection,
	onImportWorktrees,
	onOpenInFinder,
	onOpenSettings,
	onHide,
	onDelete,
	onRename,
	children,
}: DashboardSidebarProjectContextMenuProps) {
	const { preferences, setTagFolderHidden } = useV2UserPreferences();
	const collections = useSidebarProjectCollections();
	const canMove = collections?.canMoveProject(projectId) ?? false;
	const currentCollection = collections?.collectionByProjectId.get(projectId);
	const hiddenTags = preferences.hiddenTagFolders[projectId] ?? [];
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					<Trans>Rename</Trans>
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger disabled={!canMove}>
						<LuArrowRightLeft className="size-4 mr-2" />
						<Trans>Move to collection</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{collections?.collections.map((collection) => (
							<ContextMenuCheckboxItem
								key={collection.id}
								checked={currentCollection?.id === collection.id}
								onSelect={() => {
									void collections.run({
										type: "move",
										projectIds: [projectId],
										tag: collection.tag,
									});
								}}
							>
								<span
									className="mr-2 size-2.5 rounded-full bg-muted-foreground"
									style={
										collection.color
											? { backgroundColor: collection.color }
											: undefined
									}
								/>
								{collection.name}
							</ContextMenuCheckboxItem>
						))}
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={() => collections?.create([projectId])}>
							<Trans>New collection…</Trans>
						</ContextMenuItem>
						{currentCollection && (
							<ContextMenuItem
								onSelect={() => {
									void collections?.run({
										type: "move",
										projectIds: [projectId],
										tag: null,
									});
								}}
							>
								<Trans>Remove from collection</Trans>
							</ContextMenuItem>
						)}
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" />
					<Trans>Open in Finder</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onOpenSettings}>
					<LuSettings className="size-4 mr-2" />
					<Trans>Project Settings</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					<Trans>New group</Trans>
				</ContextMenuItem>
				{hiddenTags.length > 0 ? (
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuEye className="size-4 mr-2" />
							<Trans>Hidden folders</Trans>
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
					<Trans>Import untracked worktrees</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onHide}>
					<LuEyeOff className="size-4 mr-2" />
					<Trans>Hide from Sidebar</Trans>
				</ContextMenuItem>
				{onDelete ? (
					<ContextMenuItem variant="destructive" onSelect={onDelete}>
						<LuTrash2 className="size-4 mr-2" />
						<Trans>Delete Project…</Trans>
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
