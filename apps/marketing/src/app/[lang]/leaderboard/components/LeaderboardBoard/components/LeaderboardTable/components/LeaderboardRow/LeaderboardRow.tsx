import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { TierGateHover } from "@/app/[lang]/components/TierGateHover";
import type {
	LeaderboardMetric,
	StandingRow,
} from "@/app/[lang]/utils/fetchLeaderboard";
import {
	formatCount,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { DeveloperAvatar } from "../DeveloperAvatar";

interface LeaderboardRowProps {
	row: StandingRow;
	metric: LeaderboardMetric;
	isViewer?: boolean;
	pinned?: boolean;
	pixelClassName?: string;
}

export function LeaderboardRow({
	row,
	metric,
	isViewer = false,
	pinned = false,
	pixelClassName = "",
}: LeaderboardRowProps) {
	const { t } = useLingui();

	return (
		<tr
			className={`border-b border-border/50 last:border-b-0 transition-colors ${
				pinned ? "border-t-2 border-t-brand/40" : ""
			} ${isViewer ? "bg-brand/[0.06]" : "hover:bg-foreground/[0.02]"}`}
		>
			<td
				className={`px-4 py-3 text-sm text-muted-foreground ${pixelClassName}`}
			>
				{row.rank}
			</td>
			<td className="px-4 py-3">
				<Link
					href={`/${row.handle}`}
					className="flex items-center gap-3 min-w-0 group/row"
				>
					<DeveloperAvatar handle={row.handle} />
					<div className="min-w-0">
						{row.name ? (
							<>
								<div className="text-sm text-foreground truncate group-hover/row:text-brand transition-colors">
									{row.name}
									{isViewer && (
										<span className="ml-2 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-brand">
											{t({ message: "YOU" })}
										</span>
									)}
								</div>
								<div className="font-mono text-[0.7rem] text-muted-foreground truncate">
									@{row.handle}
								</div>
							</>
						) : (
							<div className="font-mono text-sm text-foreground truncate group-hover/row:text-brand transition-colors">
								@{row.handle}
								{isViewer && (
									<span className="ml-2 text-[0.55rem] uppercase tracking-[0.14em] text-brand">
										{t({ message: "YOU" })}
									</span>
								)}
							</div>
						)}
					</div>
				</Link>
			</td>
			<td className="px-4 py-3 hidden md:table-cell">
				<TierGateHover
					tier={row.tier ?? 0}
					axes={row.axes}
					handle={row.handle}
				/>
			</td>
			<td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
				{formatCount(row.sessions)}
			</td>
			<td
				className={`px-4 py-3 text-right text-sm text-foreground ${pixelClassName}`}
			>
				{metric === "cost" ? formatUsd(row.usd) : formatTokens(row.tokens)}
				{row.approximate && (
					<span
						className="text-muted-foreground ml-1"
						title={t({
							message: "Some models were priced with a fallback rate",
						})}
					>
						*
					</span>
				)}
			</td>
		</tr>
	);
}
