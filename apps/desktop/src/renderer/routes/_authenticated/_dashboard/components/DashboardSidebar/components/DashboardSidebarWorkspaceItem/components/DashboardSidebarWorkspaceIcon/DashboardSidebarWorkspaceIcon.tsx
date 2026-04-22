import { cn } from "@superset/ui/utils";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuCloud, LuCloudOff } from "react-icons/lu";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";

interface DashboardSidebarWorkspaceIconProps {
	hostType: DashboardSidebarWorkspaceHostType;
	hostIsOnline: boolean | null;
	isActive: boolean;
	variant: "collapsed" | "expanded";
	workspaceStatus?: ActivePaneStatus | null;
	creationStatus?: "preparing" | "generating-branch" | "creating" | "failed";
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

export function DashboardSidebarWorkspaceIcon({
	hostType,
	hostIsOnline,
	isActive,
	variant,
	workspaceStatus = null,
	creationStatus,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];
	const iconColor = isActive ? "text-foreground" : "text-muted-foreground";
	const isRemoteDeviceOffline =
		hostType === "remote-device" && hostIsOnline === false;

	const renderHostIcon = () => {
		if (hostType === "local-device") {
			return (
				<span
					className={cn(
						"size-1.5 rounded-full transition-colors",
						isActive ? "bg-foreground" : "bg-muted-foreground",
					)}
				/>
			);
		}

		if (isRemoteDeviceOffline) {
			return (
				<LuCloudOff
					className={cn("size-4 transition-colors", iconColor, "opacity-60")}
					strokeWidth={1.75}
				/>
			);
		}

		return (
			<LuCloud
				className={cn("size-4 transition-colors", iconColor)}
				strokeWidth={1.75}
			/>
		);
	};

	return (
		<>
			{creationStatus === "failed" ? (
				<HiExclamationTriangle className="size-4 text-destructive" />
			) : creationStatus || workspaceStatus === "working" ? (
				<AsciiSpinner className="text-base" />
			) : (
				renderHostIcon()
			)}
			{workspaceStatus && workspaceStatus !== "working" && (
				<span className={cn("absolute", overlayPosition)}>
					<StatusIndicator status={workspaceStatus} />
				</span>
			)}
		</>
	);
}
