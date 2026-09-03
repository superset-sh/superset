import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { PREVIEW_DAYS } from "renderer/lib/leaderboard";
import { useLeaderboardOptIn } from "renderer/routes/_authenticated/hooks/useLeaderboardOptIn";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import { useHostUsageHistory } from "../../hooks/useHostUsageHistory";
import { LeaderboardOptInPrompt } from "./components/LeaderboardOptInPrompt";
import { LeaderboardRank } from "./components/LeaderboardRank";
import {
	readLeaderboardCardCollapsed,
	writeLeaderboardCardCollapsed,
} from "./utils/leaderboardCardCollapsed";

// The public board defaults to the trailing 30 days, so the rank shown here
// matches what the user sees when they click through.
const RANK_PERIOD = "30d";

export function LeaderboardCard({ hostUrl }: { hostUrl: string | null }) {
	const optIn = useLeaderboardOptIn(RANK_PERIOD);
	const navigate = useNavigate();
	const setSearchQuery = useSetSettingsSearchQuery();

	const [collapsed, setCollapsed] = useState(readLeaderboardCardCollapsed);
	const toggleCollapsed = () => {
		setCollapsed((current) => {
			writeLeaderboardCardCollapsed(!current);
			return !current;
		});
	};

	// The opt-in switch lives under Account. Pre-filling the settings search
	// narrows that page to the leaderboard row, so the user lands on it.
	const openLeaderboardSettings = () => {
		setSearchQuery("leaderboard");
		void navigate({ to: "/settings/account" });
	};

	// Same key as the history section below, so the tease costs no extra
	// transcript scan.
	const history = useHostUsageHistory(hostUrl, PREVIEW_DAYS);

	const stats = useQuery({
		queryKey: ["leaderboard", "public-stats", RANK_PERIOD] as const,
		queryFn: () =>
			apiTrpcClient.leaderboard.public.stats.query({ period: RANK_PERIOD }),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	const membership = optIn.membership;
	const ranked = Boolean(membership && membership.tokens > 0);

	// The rows just above and below the user, so the rank reads as a race
	// rather than a number. Public and CDN-cached, so cheap to ask for.
	const neighbors = useQuery({
		queryKey: [
			"leaderboard",
			"neighbors",
			RANK_PERIOD,
			membership?.rank ?? null,
		] as const,
		enabled: ranked,
		queryFn: () =>
			apiTrpcClient.leaderboard.public.standings.query({
				period: RANK_PERIOD,
				metric: "tokens",
				limit: 3,
				offset: Math.max((membership?.rank ?? 1) - 2, 0),
			}),
		staleTime: 60_000,
		retry: false,
	});

	if (optIn.isLoading) return null;

	const localTokens = history.data?.totals.tokens ?? null;
	const participants = stats.data?.totals.participants ?? null;

	if (membership) {
		return (
			<LeaderboardRank
				membership={membership}
				neighbors={neighbors.data?.rows ?? null}
				collapsed={collapsed}
				onToggleCollapsed={toggleCollapsed}
				onManage={openLeaderboardSettings}
			/>
		);
	}

	return (
		<LeaderboardOptInPrompt
			hostUrl={hostUrl}
			join={optIn.join}
			joining={optIn.joining}
			localTokens={localTokens}
			localTokensLoading={history.isLoading}
			participants={participants}
			collapsed={collapsed}
			onToggleCollapsed={toggleCollapsed}
		/>
	);
}
