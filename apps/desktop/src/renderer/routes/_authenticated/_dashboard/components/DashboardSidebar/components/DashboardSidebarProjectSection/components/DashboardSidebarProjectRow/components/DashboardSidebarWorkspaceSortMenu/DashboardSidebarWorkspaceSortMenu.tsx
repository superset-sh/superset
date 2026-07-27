import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiOutlineBarsArrowDown } from "react-icons/hi2";
import type { DashboardSidebarWorkspaceSort } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

interface DashboardSidebarWorkspaceSortMenuProps {
	projectName: string;
	value: DashboardSidebarWorkspaceSort;
	onValueChange: (value: DashboardSidebarWorkspaceSort) => void;
}

const SORT_OPTIONS: Array<{
	value: DashboardSidebarWorkspaceSort;
	label: string;
	description: string;
}> = [
	{
		value: "manual",
		label: "Manual order",
		description: "Drag to arrange",
	},
	{
		value: "status",
		label: "Agent status",
		description: "Action and working first",
	},
	{
		value: "created-desc",
		label: "Newest first",
		description: "Recently created first",
	},
	{
		value: "created-asc",
		label: "Oldest first",
		description: "Earliest created first",
	},
	{
		value: "name",
		label: "Name",
		description: "A to Z",
	},
];

const SORT_LABELS = Object.fromEntries(
	SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<DashboardSidebarWorkspaceSort, string>;

export function DashboardSidebarWorkspaceSortMenu({
	projectName,
	value,
	onValueChange,
}: DashboardSidebarWorkspaceSortMenuProps) {
	const isManual = value === "manual";
	const label = SORT_LABELS[value];

	return (
		<DropdownMenu>
			<Tooltip delayDuration={400}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={`Sort ${projectName} workspaces. Current order: ${label}`}
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							onContextMenu={(event) => event.stopPropagation()}
							className={cn(
								"flex size-6 items-center justify-center rounded text-muted-foreground transition-[background-color,color,opacity]",
								"hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100",
								isManual
									? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
									: "bg-muted/70 text-foreground",
							)}
						>
							<HiOutlineBarsArrowDown className="size-4" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					Sort workspaces · {label}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="w-56"
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuLabel>Sort workspaces</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(nextValue) =>
						onValueChange(nextValue as DashboardSidebarWorkspaceSort)
					}
				>
					{SORT_OPTIONS.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
							className="items-start py-2"
						>
							<span className="flex min-w-0 flex-col">
								<span>{option.label}</span>
								<span className="text-xs font-normal text-muted-foreground">
									{option.description}
								</span>
							</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
