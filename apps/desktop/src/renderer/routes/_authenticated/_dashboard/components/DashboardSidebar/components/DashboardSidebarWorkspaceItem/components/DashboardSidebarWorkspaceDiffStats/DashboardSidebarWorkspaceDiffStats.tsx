import { cn } from "@superset/ui/utils";

interface DashboardSidebarWorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	isActive?: boolean;
	/**
	 * Keep occupying layout while hovered (hidden via `visibility`) instead of
	 * dropping out of flow. Set when names wrap: the row's action column is
	 * sized by the widest child, so a child leaving flow on hover would rewrap
	 * the name mid-hover.
	 */
	keepLayoutOnHover?: boolean;
}

export function DashboardSidebarWorkspaceDiffStats({
	additions,
	deletions,
	isActive,
	keepLayoutOnHover = false,
}: DashboardSidebarWorkspaceDiffStatsProps) {
	return (
		<div
			className={cn(
				"flex h-5 w-fit shrink-0 items-center justify-self-end font-mono text-[10px] tabular-nums",
				keepLayoutOnHover
					? "group-hover:invisible group-focus-within:invisible"
					: "group-hover:hidden group-focus-within:hidden",
			)}
		>
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
