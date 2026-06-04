import { cn } from "@superset/ui/utils";
import { LuCircleDot, LuGitMerge, LuGitPullRequest } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DashboardSidebarWorkspacePullRequest } from "../../../../types";

interface DashboardSidebarWorkspaceStatusBadgeProps {
	state: DashboardSidebarWorkspacePullRequest["state"];
	prNumber?: number;
	prUrl?: string;
	className?: string;
}

export function DashboardSidebarWorkspaceStatusBadge({
	state,
	prNumber,
	prUrl,
	className,
}: DashboardSidebarWorkspaceStatusBadgeProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
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
	const isClickable = !!prUrl;

	const handleClick = (event: React.MouseEvent) => {
		if (!prUrl) return;
		event.stopPropagation();
		openUrl.mutate(prUrl);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={!isClickable}
			className={cn(
				"flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none shrink-0 transition-colors",
				bgColor,
				isClickable && "cursor-pointer hover:opacity-80",
				!isClickable && "cursor-default",
				className,
			)}
		>
			{icon}
			{prNumber && (
				<span className="font-mono tabular-nums leading-none text-muted-foreground">
					#{prNumber}
				</span>
			)}
		</button>
	);
}
