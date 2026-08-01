import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { VscListFilter } from "react-icons/vsc";
import type { SidebarProjectSortMode } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const SORT_MODE_LABELS: Record<SidebarProjectSortMode, string> = {
	manual: "Manual order",
	created: "Date created",
	updated: "Last updated",
};

const SORT_MODES: SidebarProjectSortMode[] = ["manual", "updated", "created"];

interface DashboardSidebarProjectsSortMenuProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
}

export function DashboardSidebarProjectsSortMenu({
	sortMode,
	onSortModeChange,
}: DashboardSidebarProjectsSortMenuProps) {
	return (
		<DropdownMenu>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="Sort projects"
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							className={cn(
								"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground",
								sortMode === "manual"
									? "text-muted-foreground"
									: "text-foreground",
							)}
						>
							<VscListFilter className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					Sort projects ({SORT_MODE_LABELS[sortMode]})
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(event) => event.preventDefault()}
				// The content portals to body but React events still bubble up the
				// component tree — without these, selecting an item triggers the
				// header row's collapse toggle.
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground/70">
					Sort by
				</DropdownMenuLabel>
				{SORT_MODES.map((mode) => (
					<DropdownMenuCheckboxItem
						key={mode}
						checked={sortMode === mode}
						onCheckedChange={() => onSortModeChange(mode)}
					>
						{SORT_MODE_LABELS[mode]}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
