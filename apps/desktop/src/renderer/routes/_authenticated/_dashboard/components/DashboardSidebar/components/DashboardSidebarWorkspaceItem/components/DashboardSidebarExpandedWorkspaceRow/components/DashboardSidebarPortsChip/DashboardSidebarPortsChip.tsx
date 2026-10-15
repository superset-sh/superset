import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { useHoverCardSafeTriangle } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useHoverCardSafeTriangle";
import { PortsCountIcon } from "renderer/routes/_authenticated/_dashboard/components/PortsCountIcon";
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
	const { isOpen, onOpenChange, onPointerLeave, toggleOpen } =
		useDashboardSidebarChipHoverSuppression();
	const safeTriangle = useHoverCardSafeTriangle(isOpen, onOpenChange);

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
			onOpenChange={safeTriangle.onOpenChange}
		>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onPointerLeave={(event) => {
						onPointerLeave();
						safeTriangle.onTriggerPointerLeave(event);
					}}
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
					className="flex size-[18px] items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-70"
				>
					{isPending ? (
						<LuLoaderCircle
							className="size-3 animate-spin"
							strokeWidth={STROKE_WIDTH}
						/>
					) : (
						<PortsCountIcon count={ports.length} size="sm" />
					)}
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				ref={safeTriangle.setCardElement}
				onPointerEnter={safeTriangle.onCardPointerEnter}
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
