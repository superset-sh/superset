import { cn } from "@superset/ui/utils";
import { CgLaptop } from "react-icons/cg";
import { RxDot } from "react-icons/rx";
import { TbCloud, TbCloudOff } from "react-icons/tb";
import { PullRequestStateIcon } from "renderer/routes/_authenticated/_dashboard/components/PullRequestStateIcon";
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
	isCreatePending: boolean;
	pullRequestState?: DashboardSidebarWorkspacePullRequest["state"] | null;
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

export function DashboardSidebarWorkspaceIcon({
	hostType,
	workspaceType,
	hostIsOnline,
	isActive,
	variant,
	workspaceStatus = null,
	isCreatePending,
	pullRequestState = null,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];
	const iconColor = cn(
		"text-muted-foreground",
		isActive ? "opacity-100" : "opacity-80",
	);
	const isRemoteDeviceOffline =
		hostType === "remote-device" && hostIsOnline === false;

	const renderPrimaryIcon = () => {
		if (pullRequestState) {
			return <PullRequestStateIcon state={pullRequestState} />;
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
			{isCreatePending || workspaceStatus === "working" ? (
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
