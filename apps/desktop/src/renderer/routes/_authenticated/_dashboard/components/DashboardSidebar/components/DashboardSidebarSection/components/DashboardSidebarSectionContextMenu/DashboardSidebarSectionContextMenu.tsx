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
import { LuPalette, LuPencil, LuTrash2 } from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

interface DashboardSidebarSectionContextMenuProps {
	color: string | null;
	onRename: () => void;
	onSetColor: (color: string | null) => void;
	onDelete: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarSectionContextMenu({
	color,
	onRename,
	onSetColor,
	onDelete,
	children,
}: DashboardSidebarSectionContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuPalette className="size-4 mr-2" />
						Set Color
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-40 max-h-80 overflow-y-auto">
						<ColorSelector
							variant="menu"
							selectedColor={color}
							onSelectColor={(selectedColor) =>
								onSetColor(
									selectedColor === PROJECT_COLOR_DEFAULT
										? null
										: selectedColor,
								)
							}
						/>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onDelete}
					className="text-destructive focus:text-destructive"
				>
					<LuTrash2 className="size-4 mr-2 text-destructive" />
					Delete Section
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
