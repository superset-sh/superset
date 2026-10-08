import type { ChangesPillStats } from "../../utils/changesPillStats";

interface ChangesStatsProps {
	stats: ChangesPillStats;
}

export function ChangesStats({ stats }: ChangesStatsProps) {
	return (
		<>
			{stats.additions > 0 && (
				<span className="tabular-nums text-emerald-600 [.dark_&]:text-[#34d399]">
					+{stats.additions}
				</span>
			)}
			{stats.deletions > 0 && (
				<span className="tabular-nums text-red-600 [.dark_&]:text-[#f87171]">
					−{stats.deletions}
				</span>
			)}
			{stats.additions === 0 && stats.deletions === 0 && (
				<span className="tabular-nums">{stats.fileCount}</span>
			)}
		</>
	);
}
