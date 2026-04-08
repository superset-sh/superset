import { cn } from "@superset/ui/utils";

interface WorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	isActive?: boolean;
	/** When true, hide the diff stats (e.g., when modifier key is held to show shortcut badges) */
	hidden?: boolean;
}

export function WorkspaceDiffStats({
	additions,
	deletions,
	isActive,
	hidden = false,
}: WorkspaceDiffStatsProps) {
	return (
		<div
			className={cn(
				"flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10px] tabular-nums group-hover:hidden",
				isActive ? "bg-foreground/10" : "bg-muted/50",
				hidden && "opacity-0 invisible",
			)}
		>
			<div className="flex items-center gap-1.5 leading-none">
				<span className="text-emerald-500/90">+{additions}</span>
				<span className="text-red-400/90">−{deletions}</span>
			</div>
		</div>
	);
}
