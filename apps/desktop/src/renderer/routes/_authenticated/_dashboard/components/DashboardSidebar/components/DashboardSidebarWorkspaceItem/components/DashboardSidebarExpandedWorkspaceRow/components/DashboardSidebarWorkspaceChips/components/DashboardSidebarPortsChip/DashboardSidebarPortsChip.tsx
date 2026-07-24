import { Badge } from "@superset/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { LuLoaderCircle, LuRadioTower, LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortsData";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";
import { DashboardSidebarPortHoverRow } from "./components/DashboardSidebarPortHoverRow";

interface DashboardSidebarPortsChipProps {
	ports: DashboardSidebarPort[];
}

/**
 * Port-count chip on the workspace row. Hovering the row swaps the count for
 * an × — clicking then kills every port at once; hovering the chip opens a
 * card listing each port with its own open/close actions.
 */
export function DashboardSidebarPortsChip({
	ports,
}: DashboardSidebarPortsChipProps) {
	const { isPending, killPorts } = useDashboardSidebarPortKill();
	const { hold, release } = useDashboardSidebarChipHoverSuppression();

	const handleCloseAll = async () => {
		if (isPending) return;
		const results = await killPorts(ports);
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				closedCount === 1 ? "Closed 1 port" : `Closed ${closedCount} ports`,
			);
		}
	};

	return (
		<HoverCard
			openDelay={150}
			closeDelay={120}
			onOpenChange={(open) => (open ? hold() : release())}
		>
			<HoverCardTrigger asChild>
				<Badge asChild variant="secondary">
					<button
						type="button"
						onPointerEnter={hold}
						onPointerLeave={release}
						onClick={(event) => {
							event.stopPropagation();
							void handleCloseAll();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.stopPropagation();
							}
						}}
						disabled={isPending}
						aria-busy={isPending}
						aria-label={`${ports.length} active ${ports.length === 1 ? "port" : "ports"} — close all`}
						className={cn(
							"group/chip h-[18px] bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground",
							"[&>svg]:size-2.5 hover:bg-muted hover:text-foreground disabled:opacity-70",
						)}
					>
						<LuRadioTower
							className="size-2.5 shrink-0"
							strokeWidth={STROKE_WIDTH}
						/>
						{isPending ? (
							<LuLoaderCircle
								className="size-2.5 shrink-0 animate-spin"
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							// The count and the × share one grid cell and cross-fade while
							// the chip itself is hovered, so it never changes width.
							<span className="grid shrink-0 items-center justify-items-center [&>*]:col-start-1 [&>*]:row-start-1">
								<span className="transition-opacity group-focus-within/chip:opacity-0 group-hover/chip:opacity-0 motion-reduce:transition-none">
									{ports.length}
								</span>
								<LuX
									className="size-2.5 opacity-0 transition-opacity group-focus-within/chip:opacity-100 group-hover/chip:opacity-100 motion-reduce:transition-none"
									strokeWidth={STROKE_WIDTH}
								/>
							</span>
						)}
					</button>
				</Badge>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={8}
				className="w-64 p-1"
			>
				<div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					<span>Ports</span>
					<span className="tabular-nums">{ports.length}</span>
				</div>
				<div className="max-h-60 overflow-y-auto">
					{ports.map((port) => (
						<DashboardSidebarPortHoverRow
							key={`${port.hostId}:${port.terminalId}:${port.port}`}
							port={port}
						/>
					))}
				</div>
				<Separator className="my-1" />
				<button
					type="button"
					onClick={() => void handleCloseAll()}
					disabled={isPending}
					className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-70"
				>
					<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
					Close all ports
				</button>
			</HoverCardContent>
		</HoverCard>
	);
}
