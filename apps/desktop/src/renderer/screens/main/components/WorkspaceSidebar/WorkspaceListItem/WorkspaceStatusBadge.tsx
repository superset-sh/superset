import { cn } from "@superset/ui/utils";
import { LuCircleDot, LuGitMerge, LuGitPullRequest } from "react-icons/lu";

type PRState = "open" | "merged" | "closed" | "draft";

interface WorkspaceStatusBadgeProps {
	state: PRState;
	prNumber?: number;
}

export function WorkspaceStatusBadge({
	state,
	prNumber,
}: WorkspaceStatusBadgeProps) {
	const iconClass = "w-3 h-3";

	const config = {
		open: {
			icon: <LuGitPullRequest className={cn(iconClass, "text-emerald-500")} />,
			bgColor: "bg-emerald-500/10",
		},
		merged: {
			icon: <LuGitMerge className={cn(iconClass, "text-purple-500")} />,
			bgColor: "bg-purple-500/10",
		},
		closed: {
			icon: <LuCircleDot className={cn(iconClass, "text-destructive")} />,
			bgColor: "bg-destructive/10",
		},
		draft: {
			icon: (
				<LuGitPullRequest className={cn(iconClass, "text-muted-foreground")} />
			),
			bgColor: "bg-muted",
		},
	};

	const { icon, bgColor } = config[state];

	return (
		<div
			className={cn(
				"flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
				bgColor,
			)}
		>
			{icon}
			{prNumber && (
				<span className="text-muted-foreground font-mono">#{prNumber}</span>
			)}
		</div>
	);
}
