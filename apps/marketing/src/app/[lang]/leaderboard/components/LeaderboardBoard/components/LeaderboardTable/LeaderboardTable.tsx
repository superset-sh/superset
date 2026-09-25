import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import type {
	LeaderboardMetric,
	StandingRow,
} from "@/app/[lang]/utils/fetchLeaderboard";
import { LeaderboardRow } from "./components/LeaderboardRow";

interface LeaderboardTableProps {
	rows: StandingRow[];
	metric: LeaderboardMetric;
	isLoading?: boolean;
	emptyReason?: "board" | "search";
	viewerHandle?: string | null;
	pinnedRow?: StandingRow | null;

	pixelClassName?: string;
}

export function LeaderboardTable({
	rows,
	metric,
	isLoading,
	emptyReason = "board",
	viewerHandle = null,
	pinnedRow = null,
	pixelClassName = "",
}: LeaderboardTableProps) {
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

	if (rows.length === 0 && !pinnedRow) {
		return (
			<div className="border border-border p-12 text-center">
				<p className="text-sm text-muted-foreground">
					{emptyReason === "search" ? (
						<Trans>Nobody here by that name.</Trans>
					) : (
						<Trans>Nobody has joined the board yet.</Trans>
					)}
				</p>
				<p className="text-xs text-muted-foreground mt-2">
					{emptyReason === "search" ? (
						<Trans>Only people who opted in appear here.</Trans>
					) : (
						<Trans>Opt in from Superset under Settings → Account.</Trans>
					)}
				</p>
				<Link
					href="/download"
					className="inline-block mt-5 border border-border px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-brand hover:border-brand/50 transition-colors"
				>
					<Trans>Download Superset and publish yours</Trans>
				</Link>
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
						<LeaderboardRow
							key={row.handle}
							row={row}
							metric={metric}
							isViewer={row.handle === viewerHandle}
							pixelClassName={pixelClassName}
						/>
					))}
					{pinnedRow && (
						<LeaderboardRow
							row={pinnedRow}
							metric={metric}
							isViewer
							pinned
							pixelClassName={pixelClassName}
						/>
					)}
				</tbody>
			</table>
		</div>
	);
}
