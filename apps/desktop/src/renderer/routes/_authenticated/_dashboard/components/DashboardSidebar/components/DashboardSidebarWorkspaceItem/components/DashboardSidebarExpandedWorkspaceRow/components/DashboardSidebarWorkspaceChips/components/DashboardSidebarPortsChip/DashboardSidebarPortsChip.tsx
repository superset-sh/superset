import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";
import { DashboardSidebarPortHoverRow } from "./components/DashboardSidebarPortHoverRow";

interface DashboardSidebarPortsChipProps {
	ports: DashboardSidebarPort[];
}

/**
 * Port-count chip on the workspace row. Hovering or clicking the chip opens a
 * card listing each port with its own open/close actions; clicking the chip
 * again closes the card.
 */
export function DashboardSidebarPortsChip({
	ports,
}: DashboardSidebarPortsChipProps) {
	const { t } = useLingui();
	const { isPending, killPorts } = useDashboardSidebarPortKill();
	const { isOpen, onOpenChange, onPointerEnter, onPointerLeave, toggleOpen } =
		useDashboardSidebarChipHoverSuppression();

	const handleCloseAll = async () => {
		if (isPending) return;
		const results = await killPorts(ports);
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				t({
					message: plural(closedCount, {
						one: "Closed # port",
						other: "Closed # ports",
					}),
				}),
			);
		}
	};

	return (
		<HoverCard
			open={isOpen}
			openDelay={150}
			closeDelay={120}
			onOpenChange={onOpenChange}
		>
			<HoverCardTrigger asChild>
				<Badge asChild variant="secondary">
					<button
						type="button"
						onPointerEnter={onPointerEnter}
						onPointerLeave={onPointerLeave}
						onPointerDown={(event) => {
							event.stopPropagation();
						}}
						onClick={(event) => {
							event.stopPropagation();
							toggleOpen();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.stopPropagation();
							}
						}}
						disabled={isPending}
						aria-busy={isPending}
						aria-expanded={isOpen}
						aria-label={
							isOpen
								? t({
										message: plural(ports.length, {
											one: "# active port — hide details",
											other: "# active ports — hide details",
										}),
									})
								: t({
										message: plural(ports.length, {
											one: "# active port — show details",
											other: "# active ports — show details",
										}),
									})
						}
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
							<span className="shrink-0">{ports.length}</span>
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
					<span>
						<Trans>Ports</Trans>
					</span>
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
					<Trans>Close all ports</Trans>
				</button>
			</HoverCardContent>
		</HoverCard>
	);
}
