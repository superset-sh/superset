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
	LuArrowRightLeft,
	LuArrowUp,
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
import { useProjectSectionMenu } from "./hooks/useProjectSectionMenu";

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
	projectSectionId: string | null;
	/** The icon rail: section headers aren't shown, so nothing to rename in. */
	isSidebarCollapsed: boolean;
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
	projectSectionId,
	isSidebarCollapsed,
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
	const hiddenTags = preferences.hiddenTagFolders[projectId] ?? [];
	const { sections, moveToSection, moveToNewSection } = useProjectSectionMenu({
		projectId,
		renameNewSection: !isSidebarCollapsed,
	});
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
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuArrowRightLeft className="size-4 mr-2" />
						<Trans>Move to section</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-48 max-h-80 overflow-y-auto">
						{sections.map((section) => (
							<ContextMenuItem
								key={section.id}
								disabled={section.id === projectSectionId}
								onSelect={() => moveToSection(section.id)}
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
						{sections.length > 0 && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={moveToNewSection}>
							<LuFolderPlus className="size-4 mr-2" />
							<Trans>New section</Trans>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				{projectSectionId !== null && (
					<ContextMenuItem onSelect={() => moveToSection(null)}>
						<LuArrowUp className="size-4 mr-2" />
						<Trans>Remove from section</Trans>
					</ContextMenuItem>
				)}
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
