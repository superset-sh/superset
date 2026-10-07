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
import { useRef } from "react";
import {
	LuEye,
	LuEyeOff,
	LuFolderInput,
	LuFolderOpen,
	LuFolderPlus,
	LuPalette,
	LuPencil,
	LuSettings,
	LuTrash2,
} from "react-icons/lu";
import {
	ColorSelector,
	CustomColorInput,
} from "renderer/components/ColorSelector";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface DashboardSidebarProjectContextMenuProps {
	projectId: string;
	projectColor: string | null;
	onSetColor: (color: string | null) => void;
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
	projectColor,
	onSetColor,
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
	const customColorInputRef = useRef<HTMLInputElement>(null);
	return (
		<>
			<CustomColorInput
				ref={customColorInputRef}
				value={projectColor ?? "#64748b"}
				onCommit={onSetColor}
				tabIndex={-1}
				aria-hidden
				className="sr-only"
			/>
			<ContextMenu>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
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
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuPalette className="size-4 mr-2" />
							<Trans>Color</Trans>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-48">
							<ColorSelector
								variant="menu"
								includeDefault
								selectedColor={projectColor}
								onSelectColor={(color) =>
									onSetColor(color === PROJECT_COLOR_DEFAULT ? null : color)
								}
								onPickCustom={() => customColorInputRef.current?.click()}
							/>
						</ContextMenuSubContent>
					</ContextMenuSub>
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
		</>
	);
}
