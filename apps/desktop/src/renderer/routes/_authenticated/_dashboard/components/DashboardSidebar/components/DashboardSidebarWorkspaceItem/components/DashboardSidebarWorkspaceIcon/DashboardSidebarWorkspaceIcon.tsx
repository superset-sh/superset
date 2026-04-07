import { cn } from "@superset/ui/utils";
import { LuCloud, LuGitMerge, LuLaptop } from "react-icons/lu";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";

interface DashboardSidebarWorkspaceIconProps {
	hostType: DashboardSidebarWorkspaceHostType;
	isActive: boolean;
	variant: "collapsed" | "expanded";
	workspaceStatus?: ActivePaneStatus | null;
	creationStatus?: "preparing" | "generating-branch" | "creating";
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

export function DashboardSidebarWorkspaceIcon({
	hostType,
	isActive,
	variant,
	workspaceStatus = null,
	creationStatus,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];

	return (
		<>
			{creationStatus || workspaceStatus === "working" ? (
				<AsciiSpinner className="text-base" />
			) : hostType === "cloud" ? (
				<LuCloud
					className={cn(
						"size-4 transition-colors",
						variant === "expanded" && "transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			) : hostType === "remote-device" ? (
				<LuLaptop
					className={cn(
						"size-4 transition-colors",
						variant === "expanded" && "transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			) : (
				<LuGitMerge
					className={cn(
						"size-4 transition-colors",
						variant === "expanded" && "transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			)}
			{workspaceStatus && workspaceStatus !== "working" && (
				<span className={cn("absolute", overlayPosition)}>
					<StatusIndicator status={workspaceStatus} />
				</span>
			)}
		</>
	);
}
