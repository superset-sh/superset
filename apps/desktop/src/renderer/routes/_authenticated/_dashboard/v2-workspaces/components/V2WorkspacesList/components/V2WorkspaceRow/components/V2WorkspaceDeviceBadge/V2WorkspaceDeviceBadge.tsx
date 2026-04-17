import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuCloud, LuLaptop, LuMonitor } from "react-icons/lu";
import type { V2WorkspaceHostType } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface V2WorkspaceDeviceBadgeProps {
	hostType: V2WorkspaceHostType;
	hostName: string;
	isOnline: boolean;
}

export function V2WorkspaceDeviceBadge({
	hostType,
	hostName,
	isOnline,
}: V2WorkspaceDeviceBadgeProps) {
	const Icon =
		hostType === "cloud"
			? LuCloud
			: hostType === "local-device"
				? LuLaptop
				: LuMonitor;

	// The local device is always reachable from here — ignore any stale
	// isOnline flag on that row.
	const treatAsOffline = !isOnline && hostType !== "local-device";

	const badge = (
		<Badge
			variant="outline"
			className={cn(
				"gap-1 font-normal",
				treatAsOffline && "text-muted-foreground/70",
			)}
		>
			<Icon className="size-3" />
			<span className="max-w-[12rem] truncate">{hostName}</span>
			{treatAsOffline ? (
				<span
					aria-hidden
					className="ml-0.5 inline-block size-1.5 rounded-full bg-muted-foreground/50"
				/>
			) : null}
		</Badge>
	);

	if (!treatAsOffline) {
		return badge;
	}

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>{badge}</TooltipTrigger>
			<TooltipContent side="top">Host is offline</TooltipContent>
		</Tooltip>
	);
}
