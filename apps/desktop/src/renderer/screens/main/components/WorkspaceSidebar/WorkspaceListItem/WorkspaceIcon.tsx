import { cn } from "@superset/ui/utils";
import {
	LuFolderGit2,
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuLaptop,
} from "react-icons/lu";
import { AsciiSpinner } from "renderer/screens/main/components/AsciiSpinner";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import { STROKE_WIDTH } from "../constants";

type PRState = "open" | "merged" | "closed" | "draft";

interface WorkspaceIconProps {
	isBranchWorkspace: boolean;
	isActive: boolean;
	isUnread: boolean;
	workspaceStatus: ActivePaneStatus | null;
	variant: "collapsed" | "expanded";
	prState?: PRState;
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
	prState,
}: WorkspaceIconProps) {
	const overlayPosition = OVERLAY_POSITION[variant];

	// Determine color based on PR state or default to active/inactive
	const getIconColor = () => {
		if (!prState) {
			return isActive ? "text-foreground" : "text-muted-foreground";
		}

		switch (prState) {
			case "open":
				return "text-emerald-500";
			case "merged":
				return "text-purple-500";
			case "closed":
				return "text-destructive";
			case "draft":
				return "text-muted-foreground";
			default:
				return isActive ? "text-foreground" : "text-muted-foreground";
		}
	};

	// Determine icon based on workspace type and PR state
	const getIcon = () => {
		if (workspaceStatus === "working") {
			return <AsciiSpinner className="text-base" />;
		}

		if (isBranchWorkspace) {
			return (
				<LuLaptop
					className={cn(
						"size-4",
						variant === "expanded" && "transition-colors",
						getIconColor(),
					)}
					strokeWidth={STROKE_WIDTH}
				/>
			);
		}

		// For worktree workspaces, use PR state icons if available
		if (prState) {
			switch (prState) {
				case "open":
					return (
						<LuGitPullRequest
							className={cn(
								"size-4",
								variant === "expanded" && "transition-colors",
								getIconColor(),
							)}
							strokeWidth={STROKE_WIDTH}
						/>
					);
				case "merged":
					return (
						<LuGitMerge
							className={cn(
								"size-4",
								variant === "expanded" && "transition-colors",
								getIconColor(),
							)}
							strokeWidth={STROKE_WIDTH}
						/>
					);
				case "closed":
					return (
						<LuGitPullRequestClosed
							className={cn(
								"size-4",
								variant === "expanded" && "transition-colors",
								getIconColor(),
							)}
							strokeWidth={STROKE_WIDTH}
						/>
					);
				case "draft":
					return (
						<LuGitPullRequest
							className={cn(
								"size-4",
								variant === "expanded" && "transition-colors",
								getIconColor(),
							)}
							strokeWidth={STROKE_WIDTH}
						/>
					);
			}
		}

		// Default to folder icon for worktree without PR state
		return (
			<LuFolderGit2
				className={cn(
					"size-4",
					variant === "expanded" && "transition-colors",
					getIconColor(),
				)}
				strokeWidth={STROKE_WIDTH}
			/>
		);
	};

	return (
		<>
			{getIcon()}
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
