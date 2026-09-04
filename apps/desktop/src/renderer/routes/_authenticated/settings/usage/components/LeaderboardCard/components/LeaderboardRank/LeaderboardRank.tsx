import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import { formatTokens } from "@superset/shared/format-tokens";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { ExternalLinkIcon, SettingsIcon } from "lucide-react";
import { CardFrame } from "../CardFrame";
import { type NeighborRow, RankNeighbors } from "./components/RankNeighbors";
import { TierBadge } from "./components/TierBadge";

type Membership = NonNullable<RouterOutputs["leaderboard"]["me"]>;

interface LeaderboardRankProps {
	membership: Membership;
	neighbors?: NeighborRow[] | null;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	onManage: () => void;
}

export function LeaderboardRank({
	membership,
	neighbors = null,
	collapsed,
	onToggleCollapsed,
	onManage,
}: LeaderboardRankProps) {
	const { t } = useLingui();
	const { handle, rank, total, tokens } = membership;
	const ranked = tokens > 0;
	const profileUrl = `${COMPANY.MARKETING_URL}/user/${handle}`;
	// The tier only exists on the standings row, which can lag a fresh
	// publish; no badge beats a stale one.
	const tier = neighbors?.find((row) => row.rank === rank)?.tier ?? null;

	return (
		<CardFrame
			collapsed={collapsed}
			onToggleCollapsed={onToggleCollapsed}
			title={
				ranked ? (
					<span className="inline-flex items-center gap-2">
						<Trans>
							<span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
								#{formatNumber(rank)}
							</span>{" "}
							<span>of {formatNumber(total)} on the leaderboard</span>
						</Trans>
						{tier !== null && <TierBadge tier={tier} />}
					</span>
				) : (
					<Trans>You're on the leaderboard, but not ranked yet</Trans>
				)
			}
			actions={
				<>
					<Button size="sm" variant="outline" asChild>
						<a
							href={`${COMPANY.MARKETING_URL}/leaderboard`}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Trans>Open leaderboard</Trans>
							<ExternalLinkIcon className="size-3.5" />
						</a>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="size-7 p-0"
						aria-label={t({
							message: "Leaderboard settings",
						})}
						onClick={onManage}
					>
						<SettingsIcon className="size-3.5" />
					</Button>
				</>
			}
		>
			<p className="mt-1 pl-7 text-xs text-muted-foreground">
				{ranked ? (
					<Trans>
						{formatTokens(tokens)} tokens in the last 30 days. Publishing as{" "}
						<a
							href={profileUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground hover:underline"
						>
							{handle}
						</a>
						.
					</Trans>
				) : (
					<Trans>
						Nothing published in the last 30 days yet. Your rank appears once
						usage from this machine syncs, publishing as{" "}
						<a
							href={profileUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground hover:underline"
						>
							{handle}
						</a>
						.
					</Trans>
				)}
			</p>
			{ranked && neighbors && (
				<RankNeighbors me={{ rank, tokens }} rows={neighbors} />
			)}
		</CardFrame>
	);
}
