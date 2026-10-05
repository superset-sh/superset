import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { PortForward } from "shared/types";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";
import { formatPortRowLabel } from "../../utils/formatPortRowLabel";

interface DashboardSidebarPortRowProps {
	port: Pick<DashboardSidebarPort, "port" | "label" | "hostType">;
	forward: Pick<PortForward, "status"> | null;
	isBusy: boolean;
	onOpen: () => void;
	onClose: () => void;
	actions?: ReactNode;
}

export function DashboardSidebarPortRow({
	port,
	forward,
	isBusy,
	onOpen,
	onClose,
	actions,
}: DashboardSidebarPortRowProps) {
	const { t } = useLingui();
	const address = formatPortRowLabel({ port, forward });
	const addressText = (
		<span className="min-w-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground">
			{address.text}
		</span>
	);

	return (
		<div className="group/row flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-fill-hover">
			<button
				type="button"
				onClick={onOpen}
				disabled={isBusy}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<span className="size-1.5 shrink-0 rounded-full bg-green-500" />
				{port.label && (
					<span className="min-w-0 truncate text-xs">{port.label}</span>
				)}
				{address.title ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>{addressText}</TooltipTrigger>
						<TooltipContent side="top">{address.title}</TooltipContent>
					</Tooltip>
				) : (
					addressText
				)}
			</button>
			{actions}
			<button
				type="button"
				onClick={onClose}
				disabled={isBusy}
				aria-label={t({ message: `Close port ${port.port}` })}
				className="invisible flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-focus-within/row:visible group-hover/row:visible"
			>
				<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
			</button>
		</div>
	);
}
