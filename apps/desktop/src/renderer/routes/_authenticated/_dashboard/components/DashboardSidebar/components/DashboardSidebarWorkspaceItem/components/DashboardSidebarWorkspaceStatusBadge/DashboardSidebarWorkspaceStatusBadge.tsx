import { cn } from "@superset/ui/utils";
import { LuCircleDot, LuGitMerge, LuGitPullRequest } from "react-icons/lu";
import type { DashboardSidebarWorkspacePullRequest } from "../../../../types";

interface DashboardSidebarWorkspaceStatusBadgeProps {
	state: DashboardSidebarWorkspacePullRequest["state"];
	prNumber?: number;
	className?: string;
}

export function DashboardSidebarWorkspaceStatusBadge({
	state,
	prNumber,
	className,
}: DashboardSidebarWorkspaceStatusBadgeProps) {
	const iconClass = "h-3 w-3";

	const config = {
		open: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-emerald-500")}
					strokeWidth={1.75}
				/>
			),
			bgColor: "bg-emerald-500/10",
		},
		merged: {
			icon: (
				<LuGitMerge
					className={cn(iconClass, "text-purple-500")}
					strokeWidth={1.75}
				/>
			),
			bgColor: "bg-purple-500/10",
		},
		closed: {
			icon: (
				<LuCircleDot
					className={cn(iconClass, "text-destructive")}
					strokeWidth={1.75}
				/>
			),
			bgColor: "bg-destructive/10",
		},
		draft: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-muted-foreground")}
					strokeWidth={1.75}
				/>
			),
			bgColor: "bg-muted",
		},
	};

	const { icon, bgColor } = config[state];

	return (
		<div
			className={cn(
				"flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none shrink-0",
				bgColor,
				className,
			)}
		>
			{icon}
			{prNumber && (
				<span className="font-mono tabular-nums leading-none text-muted-foreground">
					#{prNumber}
				</span>
			)}
		</div>
	);
}
