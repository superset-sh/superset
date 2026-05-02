import { cn } from "@superset/ui/utils";
import { CgLaptop } from "react-icons/cg";
import { HiExclamationTriangle } from "react-icons/hi2";
import {
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
} from "react-icons/lu";
import { RxDot } from "react-icons/rx";
import { TbCloud, TbCloudOff } from "react-icons/tb";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspacePullRequest,
	DashboardSidebarWorkspaceType,
} from "../../../../types";

interface DashboardSidebarWorkspaceIconProps {
	hostType: DashboardSidebarWorkspaceHostType;
	workspaceType: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean | null;
	isActive: boolean;
	variant: "collapsed" | "expanded";
	workspaceStatus?: ActivePaneStatus | null;
	creationStatus?: "preparing" | "generating-branch" | "creating" | "failed";
	pullRequestState?: DashboardSidebarWorkspacePullRequest["state"] | null;
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

const PR_ICON_BY_STATE = {
	open: LuGitPullRequest,
	merged: LuGitMerge,
	closed: LuGitPullRequestClosed,
	draft: LuGitPullRequestDraft,
} as const;

const PR_COLOR_BY_STATE = {
	open: "text-emerald-500",
	merged: "text-purple-500",
	closed: "text-destructive",
	draft: "text-muted-foreground",
} as const;

export function DashboardSidebarWorkspaceIcon({
	hostType,
	workspaceType,
	hostIsOnline,
	isActive,
	variant,
	workspaceStatus = null,
	creationStatus,
	pullRequestState = null,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];
	const iconColor = isActive ? "text-foreground" : "text-muted-foreground";
	const isRemoteDeviceOffline =
		hostType === "remote-device" && hostIsOnline === false;

	const renderPrimaryIcon = () => {
		if (pullRequestState) {
			const PrIcon = PR_ICON_BY_STATE[pullRequestState];
			return (
				<PrIcon
					className={cn("size-3.5", PR_COLOR_BY_STATE[pullRequestState])}
					strokeWidth={1.75}
				/>
			);
		}

		if (hostType === "local-device") {
			if (workspaceType === "main") {
				return (
					<CgLaptop className={cn("size-4 transition-colors", iconColor)} />
				);
			}

			return <RxDot className={cn("size-4 transition-colors", iconColor)} />;
		}

		if (isRemoteDeviceOffline) {
			return (
				<TbCloudOff
					className={cn("size-4 transition-colors", iconColor, "opacity-60")}
					strokeWidth={1.75}
				/>
			);
		}

		return (
			<TbCloud
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
				renderPrimaryIcon()
			)}
			{workspaceStatus && workspaceStatus !== "working" && (
				<span className={cn("absolute", overlayPosition)}>
					<StatusIndicator status={workspaceStatus} />
				</span>
			)}
		</>
	);
}
