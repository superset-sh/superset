import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuEllipsis } from "react-icons/lu";
import type { DashboardSidebarSectionActionsProps } from "../../types";
import { SectionActionsMenuItems } from "../SectionActionsMenuItems";

export function DashboardSidebarSectionActionsDropdown({
	color,
	onRename,
	onSetColor,
	onDelete,
}: DashboardSidebarSectionActionsProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
					onContextMenu={(event) => event.stopPropagation()}
					className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/80 opacity-0 transition-[opacity,color,background-color] hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
					aria-label="Group actions"
				>
					<LuEllipsis className="size-3.5" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-44"
				onCloseAutoFocus={(event) => event.preventDefault()}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<SectionActionsMenuItems
					color={color}
					kind="dropdown"
					onRename={onRename}
					onSetColor={onSetColor}
					onDelete={onDelete}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
