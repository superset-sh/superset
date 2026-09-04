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
	LuEye,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
	onCreateSection: () => void;
	onImportWorktrees: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
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
					<Trans>Rename</Trans>
				</ContextMenuItem>
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
				<ContextMenuItem onSelect={onRemoveFromSidebar}>
					<LuX className="size-4 mr-2" />
					<Trans>Remove from Sidebar</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
