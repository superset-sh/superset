import { Trans } from "@lingui/react/macro";
import type {
	LeaderboardMetric,
	StandingRow,
} from "@/app/[lang]/utils/fetchLeaderboard";
import { LeaderboardRow } from "./components/LeaderboardRow";

interface LeaderboardTableProps {
	rows: StandingRow[];
	metric: LeaderboardMetric;
	isLoading?: boolean;
	onClearSearch?: () => void;
	emptyReason?: "board" | "search";
	viewerHandle?: string | null;
	pinnedRow?: StandingRow | null;

	pixelClassName?: string;
}

export function LeaderboardTable({
	rows,
	metric,
	isLoading,
	onClearSearch,
	emptyReason = "board",
	viewerHandle = null,
	pinnedRow = null,
	pixelClassName = "",
}: LeaderboardTableProps) {
	if (isLoading) {
		return (
			<div aria-busy="true" className="border border-border">
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
				{emptyReason === "search" ? (
					<button
						type="button"
						onClick={onClearSearch}
						className="min-h-11 mt-5 border border-border px-4 py-2 text-sm text-brand hover:border-brand/50"
					>
						<Trans>Clear search</Trans>
					</button>
				) : null}
			</div>
		);
	}

	return (
		<div className="rounded-[2px] border border-border overflow-x-auto">
			<table className="w-full table-fixed sm:table-auto border-collapse">
				<thead>
					<tr className="border-b border-border bg-foreground/[0.02]">
						<th className="text-left font-medium text-xs text-muted-foreground px-2 sm:px-4 py-3 w-10 sm:w-14">
							#
						</th>
						<th className="text-left font-medium text-xs text-muted-foreground px-2 sm:px-4 py-3">
							<Trans>Developer</Trans>
						</th>
						<th className="text-left font-medium text-xs text-muted-foreground px-2 sm:px-4 py-3 hidden md:table-cell">
							<Trans>Tier</Trans>
						</th>
						<th className="text-right font-medium text-xs text-muted-foreground px-2 sm:px-4 py-3 hidden sm:table-cell">
							<Trans>Sessions</Trans>
						</th>
						<th className="w-24 sm:w-auto text-right font-medium text-xs text-muted-foreground px-2 sm:px-4 py-3">
							{metric === "cost" ? <Trans>Cost</Trans> : <Trans>Tokens</Trans>}
						</th>
					</tr>
				</thead>
				<tbody>
					{pinnedRow && (
						<LeaderboardRow
							row={pinnedRow}
							metric={metric}
							isViewer
							pinned
							pixelClassName={pixelClassName}
						/>
					)}
					{rows.map((row) => (
						<LeaderboardRow
							key={row.handle}
							row={row}
							metric={metric}
							isViewer={row.handle === viewerHandle}
							pixelClassName={pixelClassName}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}
