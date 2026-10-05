import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuUnplug } from "react-icons/lu";
import type { PortForward } from "shared/types";
import type { DashboardSidebarPort } from "../../../../hooks/useDashboardSidebarPortsData";
import { DashboardSidebarPortRow } from "../../../DashboardSidebarPortRow";

interface DashboardSidebarPortsCardProps {
	ports: Array<
		Pick<DashboardSidebarPort, "port" | "label" | "hostType"> & {
			forward: Pick<PortForward, "status"> | null;
		}
	>;
	isBusy?: boolean;
	onOpenPort: (port: number) => void;
	onClosePort: (port: number) => void;
	onCloseAll: () => void;
}

export function DashboardSidebarPortsCard({
	ports,
	isBusy = false,
	onOpenPort,
	onClosePort,
	onCloseAll,
}: DashboardSidebarPortsCardProps) {
	const { t } = useLingui();
	return (
		<div className="group/card p-1">
			<div className="flex h-7 items-center justify-between pr-1 pl-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
				<span>
					<Trans>Ports</Trans>
				</span>
				<span className="relative flex size-5 items-center justify-center">
					<span className="tabular-nums transition-opacity group-focus-within/card:opacity-0 group-hover/card:opacity-0">
						{ports.length}
					</span>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onCloseAll}
								disabled={isBusy}
								aria-label={t({ message: "Close all ports" })}
								className="pointer-events-none absolute inset-0 flex items-center justify-center rounded opacity-0 transition-opacity group-hover/card:pointer-events-auto group-hover/card:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-foreground/10 hover:text-foreground disabled:opacity-50"
							>
								<LuUnplug className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">
							<Trans>Close all ports</Trans>
						</TooltipContent>
					</Tooltip>
				</span>
			</div>
			<div className="max-h-60 overflow-y-auto">
				{ports.map((port) => (
					<DashboardSidebarPortRow
						key={port.port}
						port={port}
						forward={port.forward}
						isBusy={isBusy}
						onOpen={() => onOpenPort(port.port)}
						onClose={() => onClosePort(port.port)}
					/>
				))}
			</div>
		</div>
	);
}
