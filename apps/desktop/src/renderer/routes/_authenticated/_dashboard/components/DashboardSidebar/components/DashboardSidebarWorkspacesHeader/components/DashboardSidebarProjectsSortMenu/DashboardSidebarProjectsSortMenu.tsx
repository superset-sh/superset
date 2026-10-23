import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiOutlineBarsArrowDown } from "react-icons/hi2";
import type {
	SidebarProjectHostFilter,
	SidebarProjectOrder,
	SidebarProjectSortMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const PROJECT_ORDERS: SidebarProjectOrder[] = ["manual", "nameAsc", "nameDesc"];
const SORT_MODES: SidebarProjectSortMode[] = ["manual", "active", "created"];
const HOST_FILTERS: SidebarProjectHostFilter[] = ["all", "local", "cloud"];

interface DashboardSidebarProjectsSortMenuProps {
	sortMode: SidebarProjectSortMode;
	onSortModeChange: (mode: SidebarProjectSortMode) => void;
	projectOrder: SidebarProjectOrder;
	onProjectOrderChange: (order: SidebarProjectOrder) => void;
	/** Null hides the host filter (cloud rows are not inline). */
	hostFilter: SidebarProjectHostFilter | null;
	onHostFilterChange: (filter: SidebarProjectHostFilter) => void;
}

/**
 * Sort-mode picker in the Projects header. Orders the project list (drag
 * order or by name) and, separately, the workspaces inside each project. Lives
 * inside the header strip, which toggles the section on click, so the trigger
 * and the (portaled, but React-bubbling) menu content both stop propagation.
 */
export function DashboardSidebarProjectsSortMenu({
	sortMode,
	onSortModeChange,
	projectOrder,
	onProjectOrderChange,
	hostFilter,
	onHostFilterChange,
}: DashboardSidebarProjectsSortMenuProps) {
	const { t } = useLingui();
	const labels: Record<SidebarProjectSortMode, string> = {
		manual: t({
			message: "Manual order",
		}),
		active: t({
			message: "Last active",
		}),
		created: t({
			message: "Date created",
		}),
	};
	const currentLabel = labels[sortMode];
	const projectOrderLabels: Record<SidebarProjectOrder, string> = {
		manual: t({
			message: "Manual order",
		}),
		nameAsc: t({
			message: "Name A–Z",
		}),
		nameDesc: t({
			message: "Name Z–A",
		}),
	};
	const projectOrderLabel = projectOrderLabels[projectOrder];
	const hostLabels: Record<SidebarProjectHostFilter, string> = {
		all: t({
			message: "All workspaces",
		}),
		local: t({
			message: "Local",
		}),
		cloud: t({
			message: "Cloud",
		}),
	};
	const isHostFiltered = hostFilter !== null && hostFilter !== "all";
	const hostLabel = hostFilter === null ? "" : hostLabels[hostFilter];

	return (
		<DropdownMenu>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({
								message: "Sort projects and workspaces",
							})}
							onClick={(event) => event.stopPropagation()}
							onKeyDown={(event) => event.stopPropagation()}
							className={cn(
								"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-fill-hover hover:text-foreground",
								// Read as "on" whenever the list is not the plain drag order.
								sortMode === "manual" &&
									projectOrder === "manual" &&
									!isHostFiltered
									? "text-muted-foreground"
									: "text-foreground",
							)}
						>
							<HiOutlineBarsArrowDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{isHostFiltered
						? t({
								message: `Sort workspaces (${currentLabel}) · ${hostLabel}`,
							})
						: t({
								message: `Sort workspaces (${currentLabel})`,
							})}
					{projectOrder !== "manual" && (
						<div>
							{t({
								message: `Projects: ${projectOrderLabel}`,
							})}
						</div>
					)}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(event) => event.preventDefault()}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground/70">
					{t({
						message: "Projects",
					})}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={projectOrder}
					onValueChange={(value) =>
						onProjectOrderChange(value as SidebarProjectOrder)
					}
				>
					{PROJECT_ORDERS.map((order) => (
						<DropdownMenuRadioItem key={order} value={order}>
							{projectOrderLabels[order]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				{projectOrder !== "manual" && (
					<div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground/70">
						{t({
							message: "Drag projects to reorder in Manual order",
						})}
					</div>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground/70">
					{t({
						message: "Workspaces",
					})}
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={sortMode}
					onValueChange={(value) =>
						onSortModeChange(value as SidebarProjectSortMode)
					}
				>
					{SORT_MODES.map((mode) => (
						<DropdownMenuRadioItem key={mode} value={mode}>
							{labels[mode]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				{sortMode !== "manual" && (
					<div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground/70">
						{t({
							message: "Drag workspaces to reorder in Manual order",
						})}
					</div>
				)}
				{hostFilter !== null && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-xs font-normal text-muted-foreground/70">
							{t({
								message: "Show",
							})}
						</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={hostFilter}
							onValueChange={(value) =>
								onHostFilterChange(value as SidebarProjectHostFilter)
							}
						>
							{HOST_FILTERS.map((filter) => (
								<DropdownMenuRadioItem key={filter} value={filter}>
									{hostLabels[filter]}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
