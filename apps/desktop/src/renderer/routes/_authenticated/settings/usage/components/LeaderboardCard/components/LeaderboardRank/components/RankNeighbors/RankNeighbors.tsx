import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { formatNumber } from "@superset/i18n/format";
import { formatTokens } from "@superset/shared/format-tokens";
import { cn } from "@superset/ui/utils";

export interface NeighborRow {
	rank: number;
	tokens: number;
	tier: number;
}

interface RankNeighborsProps {
	me: { rank: number; tokens: number };
	rows: NeighborRow[];
}

// Real handles stay on the public board; here the neighbours get an
// obviously fake factory-floor alias, stable per rank so it doesn't shuffle
// between renders.
const ALIASES = [
	msg({
		id: "settings.usage.leaderboardRank.alias.0",
		message: "Anonymous Assembler",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.1",
		message: "Mystery Machinist",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.2",
		message: "Nameless Foreman",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.3",
		message: "Incognito Operator",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.4",
		message: "Redacted Riveter",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.5",
		message: "Phantom Forklift",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.6",
		message: "Unknown Welder",
	}),
	msg({
		id: "settings.usage.leaderboardRank.alias.7",
		message: "Secret Shift Lead",
	}),
];

function aliasFor(rank: number): string {
	return i18n._(ALIASES[rank % ALIASES.length] ?? ALIASES[0]);
}

// League-table slice: the row above, you, the row below. Standings are
// CDN-cached, so right after a publish the user's own row can lag; it is
// synthesized from the membership so the strip never drops "you".
export function RankNeighbors({ me, rows }: RankNeighborsProps) {
	const above = rows.find((row) => row.rank === me.rank - 1) ?? null;
	const below = rows.find((row) => row.rank === me.rank + 1) ?? null;
	if (!above && !below) return null;

	const strip = [
		above && {
			rank: above.rank,
			tokens: above.tokens,
			label: aliasFor(above.rank),
			detail: null,
			isMe: false,
		},
		{
			rank: me.rank,
			tokens: me.tokens,
			label: <Trans id="settings.usage.leaderboardRank.you">You</Trans>,
			detail: above ? (
				<Trans id="settings.usage.leaderboardRank.toPass">
					{formatTokens(above.tokens - me.tokens)} to pass #
					{formatNumber(above.rank)}
				</Trans>
			) : null,
			isMe: true,
		},
		below && {
			rank: below.rank,
			tokens: below.tokens,
			label: aliasFor(below.rank),
			detail: (
				<Trans id="settings.usage.leaderboardRank.behindYou">
					{formatTokens(me.tokens - below.tokens)} behind you
				</Trans>
			),
			isMe: false,
		},
	].filter((row) => row !== null);

	return (
		<ol className="mt-3 divide-y divide-border border-t border-border pl-7 text-xs">
			{strip.map((row) => (
				<li
					key={row.rank}
					className={cn(
						"flex items-center gap-3 py-1.5",
						row.isMe ? "font-medium" : "text-muted-foreground",
					)}
				>
					<span className="w-10 shrink-0 tabular-nums">
						#{formatNumber(row.rank)}
					</span>
					<span
						className={cn("flex-1 min-w-0 truncate", !row.isMe && "italic")}
					>
						{row.label}
					</span>
					<span className="tabular-nums text-foreground">
						{formatTokens(row.tokens)}
					</span>
					<span className="w-36 shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
						{row.detail}
					</span>
				</li>
			))}
		</ol>
	);
}
