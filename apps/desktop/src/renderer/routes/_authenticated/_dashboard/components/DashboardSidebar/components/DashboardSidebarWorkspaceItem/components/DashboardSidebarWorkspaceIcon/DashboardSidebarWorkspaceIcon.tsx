import { cn } from "@superset/ui/utils";
import {
	CircleDot,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
} from "lucide-react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuCloud, LuLaptop } from "react-icons/lu";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../types";

interface DashboardSidebarWorkspaceIconProps {
	hostType: DashboardSidebarWorkspaceHostType;
	isActive: boolean;
	variant: "collapsed" | "expanded";
	workspaceStatus?: ActivePaneStatus | null;
	creationStatus?: "preparing" | "generating-branch" | "creating" | "failed";
	pullRequest?: DashboardSidebarWorkspacePullRequest | null;
}

const OVERLAY_POSITION = {
	collapsed: "top-1 right-1",
	expanded: "-top-0.5 -right-0.5",
} as const;

function PullRequestStatusIcon({
	pr,
}: {
	pr: DashboardSidebarWorkspacePullRequest;
}) {
	const className = "size-3.5";
	const strokeWidth = 1.75;
	if (pr.state === "merged") {
		return (
			<GitMerge
				className={cn(className, "text-violet-400/80")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	if (pr.state === "closed") {
		return (
			<GitPullRequestClosed
				className={cn(className, "text-rose-400/70")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	if (pr.state === "draft") {
		return (
			<GitPullRequestDraft
				className={cn(className, "text-muted-foreground/70")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	const openColor =
		pr.reviewDecision === "approved"
			? "text-emerald-400/80"
			: pr.reviewDecision === "changes_requested"
				? "text-amber-400/80"
				: "text-emerald-400/70";
	return (
		<GitPullRequest
			className={cn(className, openColor)}
			strokeWidth={strokeWidth}
		/>
	);
}

export function DashboardSidebarWorkspaceIcon({
	hostType,
	isActive,
	variant,
	workspaceStatus = null,
	creationStatus,
	pullRequest = null,
}: DashboardSidebarWorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];

	return (
		<>
			{creationStatus === "failed" ? (
				<HiExclamationTriangle className="size-4 text-destructive" />
			) : creationStatus || workspaceStatus === "working" ? (
				<AsciiSpinner className="text-base" />
			) : pullRequest ? (
				<PullRequestStatusIcon pr={pullRequest} />
			) : hostType === "cloud" ? (
				<LuCloud
					className={cn(
						"size-4 transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			) : hostType === "remote-device" ? (
				<LuLaptop
					className={cn(
						"size-4 transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
					strokeWidth={1.75}
				/>
			) : (
				<CircleDot
					className={cn(
						"size-4 transition-colors",
						isActive ? "text-foreground" : "text-muted-foreground/60",
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
