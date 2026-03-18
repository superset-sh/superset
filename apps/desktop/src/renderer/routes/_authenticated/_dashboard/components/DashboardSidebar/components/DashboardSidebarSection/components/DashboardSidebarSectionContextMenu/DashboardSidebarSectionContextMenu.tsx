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
import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { LuPalette, LuPencil, LuTrash2 } from "react-icons/lu";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";

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
					<ContextMenuSubContent className="w-36">
						{PROJECT_COLORS.map((sectionColor) => {
							const isDefault = sectionColor.value === PROJECT_COLOR_DEFAULT;
							const isSelected = isDefault
								? color == null
								: color === sectionColor.value;

							return (
								<ContextMenuItem
									key={sectionColor.value}
									onSelect={() =>
										onSetColor(isDefault ? null : sectionColor.value)
									}
									className="flex items-center gap-2"
								>
									<span
										className={cn(
											"size-3 rounded-full border",
											isDefault ? "border-border bg-muted" : "border-border/50",
										)}
										style={
											isDefault
												? undefined
												: { backgroundColor: sectionColor.value }
										}
									/>
									<span>{sectionColor.name}</span>
									{isSelected && (
										<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
									)}
								</ContextMenuItem>
							);
						})}
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
