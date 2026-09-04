import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { TierBadge } from "@/app/[lang]/components/TierBadge";
import type {
	LeaderboardMetric,
	StandingRow,
} from "@/app/[lang]/utils/fetchLeaderboard";
import {
	formatCount,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { DeveloperAvatar } from "./components/DeveloperAvatar";

interface LeaderboardTableProps {
	rows: StandingRow[];
	metric: LeaderboardMetric;
	isLoading?: boolean;

	pixelClassName?: string;
}

export function LeaderboardTable({
	rows,
	metric,
	isLoading,
	pixelClassName = "",
}: LeaderboardTableProps) {
	const { t } = useLingui();

	if (isLoading) {
		return (
			<div className="border border-border">
				{["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
					<div
						key={key}
						className="h-16 border-b border-border/50 last:border-b-0 animate-pulse bg-foreground/[0.02]"
					/>
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="border border-border p-12 text-center">
				<p className="text-sm text-muted-foreground">
					<Trans>Nobody has joined the board yet.</Trans>
				</p>
				<p className="text-xs text-muted-foreground mt-2">
					<Trans>Opt in from Superset under Settings → Account.</Trans>
				</p>
			</div>
		);
	}

	return (
		<div className="border border-border overflow-x-auto">
			<table className="w-full min-w-[640px] border-collapse">
				<thead>
					<tr className="border-b border-border bg-foreground/[0.02]">
						<th className="text-left font-normal font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground px-4 py-3 w-14">
							#
						</th>
						<th className="text-left font-normal font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground px-4 py-3">
							<Trans>Developer</Trans>
						</th>
						<th className="text-left font-normal font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground px-4 py-3 hidden md:table-cell">
							<Trans>Tier</Trans>
						</th>
						<th className="text-right font-normal font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground px-4 py-3 hidden sm:table-cell">
							<Trans>Sessions</Trans>
						</th>
						<th className="text-right font-normal font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground px-4 py-3">
							{metric === "cost" ? <Trans>Cost</Trans> : <Trans>Tokens</Trans>}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={row.handle}
							className="border-b border-border/50 last:border-b-0 hover:bg-foreground/[0.02] transition-colors"
						>
							<td
								className={`px-4 py-3 text-sm text-muted-foreground ${pixelClassName}`}
							>
								{row.rank}
							</td>
							<td className="px-4 py-3">
								<Link
									href={`/user/${row.handle}`}
									className="flex items-center gap-3 min-w-0 group/row"
								>
									<DeveloperAvatar handle={row.handle} />
									<div className="min-w-0">
										{row.name ? (
											<>
												<div className="text-sm text-foreground truncate group-hover/row:text-brand transition-colors">
													{row.name}
												</div>
												<div className="font-mono text-[0.7rem] text-muted-foreground truncate">
													@{row.handle}
												</div>
											</>
										) : (
											<div className="font-mono text-sm text-foreground truncate group-hover/row:text-brand transition-colors">
												@{row.handle}
											</div>
										)}
									</div>
								</Link>
							</td>
							<td className="px-4 py-3 hidden md:table-cell">
								<TierBadge tier={row.tier ?? 0} />
							</td>
							<td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
								{formatCount(row.sessions)}
							</td>
							<td
								className={`px-4 py-3 text-right text-sm text-foreground ${pixelClassName}`}
							>
								{metric === "cost"
									? formatUsd(row.usd)
									: formatTokens(row.tokens)}
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
					))}
				</tbody>
			</table>
		</div>
	);
}
