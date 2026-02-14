import { cn } from "@superset/ui/utils";
import { LuFolderGit2, LuLaptop } from "react-icons/lu";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";

interface WorkspaceIconProps {
	isBranchWorkspace: boolean;
	isActive: boolean;
	isUnread: boolean;
	workspaceStatus: ActivePaneStatus | null;
	variant: "collapsed" | "expanded";
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

export function WorkspaceIcon({
	isBranchWorkspace,
	isActive,
	isUnread,
	workspaceStatus,
	variant,
}: WorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];
	const iconColor = isActive ? "text-foreground" : "text-muted-foreground";

	return (
		<>
			{workspaceStatus === "working" ? (
				<AsciiSpinner className="text-base" />
			) : isBranchWorkspace ? (
				<LuLaptop
					className={cn(
						"size-4",
						variant === "expanded" && "transition-colors",
						iconColor,
					)}
					strokeWidth={STROKE_WIDTH}
				/>
			) : (
				<LuFolderGit2
					className={cn(
						"size-4",
						variant === "expanded" && "transition-colors",
						iconColor,
					)}
					strokeWidth={STROKE_WIDTH}
				/>
			)}
			{workspaceStatus && workspaceStatus !== "working" && (
				<span className={cn("absolute", overlayPosition)}>
					<StatusIndicator status={workspaceStatus} />
				</span>
			)}
			{isUnread && !workspaceStatus && (
				<span className={cn("absolute flex size-2", overlayPosition)}>
					<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
				</span>
			)}
		</>
	);
}
