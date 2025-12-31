interface WorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
}

export function WorkspaceDiffStats({
	additions,
	deletions,
}: WorkspaceDiffStatsProps) {
	return (
		<div className="flex items-center gap-1 text-[10px] font-mono">
			<span className="text-emerald-500">+{additions}</span>
			<span className="text-destructive-foreground">-{deletions}</span>
		</div>
	);
}
