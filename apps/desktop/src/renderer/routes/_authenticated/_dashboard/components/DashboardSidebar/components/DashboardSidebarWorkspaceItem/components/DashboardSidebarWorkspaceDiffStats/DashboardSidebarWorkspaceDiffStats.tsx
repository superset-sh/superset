interface DashboardSidebarWorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	isActive?: boolean;
}

export function DashboardSidebarWorkspaceDiffStats({
	additions,
	deletions,
	isActive,
}: DashboardSidebarWorkspaceDiffStatsProps) {
	return (
		<div className="flex h-5 w-fit shrink-0 items-center justify-self-end text-[10px] font-mono tabular-nums transition-[opacity,visibility] group-hover:opacity-0 group-hover:invisible">
			<div className="flex items-center gap-1.5 leading-none">
				<span
					className={isActive ? "text-emerald-500/90" : "text-muted-foreground"}
				>
					+{additions}
				</span>
				<span
					className={isActive ? "text-red-400/90" : "text-muted-foreground"}
				>
					−{deletions}
				</span>
			</div>
		</div>
	);
}
