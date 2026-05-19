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
	LuFolderOpen,
	LuFolderPlus,
	LuPalette,
	LuPencil,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";

interface DashboardSidebarProjectContextMenuProps {
	projectColor: string | null;
	onCreateSection: () => void;
	onOpenInFinder: () => void;
	onOpenSettings: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	onSetColor: (color: string) => void;
	children: React.ReactNode;
}

export function DashboardSidebarProjectContextMenu({
	projectColor,
	onCreateSection,
	onOpenInFinder,
	onOpenSettings,
	onRemoveFromSidebar,
	onRename,
	onSetColor,
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
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuPalette className="size-4 mr-2" />
						Set Color
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						<ColorSelector
							variant="menu"
							selectedColor={projectColor}
							onSelectColor={onSetColor}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuItem onSelect={onCreateSection}>
					<LuFolderPlus className="size-4 mr-2" />
					New group
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2 text-destructive" />
					Remove from Sidebar
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
