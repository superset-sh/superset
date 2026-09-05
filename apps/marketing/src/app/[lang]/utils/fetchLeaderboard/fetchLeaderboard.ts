import type { RouterOutputs } from "@superset/trpc";
import type { LeaderboardPeriod } from "@superset/trpc/leaderboard-periods";
import type { LeaderboardMetric } from "@superset/trpc/leaderboard-types";
import { TRPCClientError } from "@trpc/client";
import { leaderboardClient } from "../leaderboardClient";

export type { LeaderboardMetric, LeaderboardPeriod };

type PublicLeaderboard = RouterOutputs["leaderboard"]["public"];

export type Standings = PublicLeaderboard["standings"];
export type StandingRow = Standings["rows"][number];
export type LeaderboardStats = PublicLeaderboard["stats"];
export type ParticipantProfile = PublicLeaderboard["participant"];

export interface RangeQuery {
	period?: LeaderboardPeriod;
	from?: string;
	to?: string;
}

export interface MetricQuery extends RangeQuery {
	metric?: LeaderboardMetric;
}

export interface StandingsQuery extends MetricQuery {
	limit?: number;
	offset?: number;
}

export async function fetchStandings(
	options: StandingsQuery = {},
	signal?: AbortSignal,
): Promise<Standings | null> {
	try {
		return await leaderboardClient.leaderboard.public.standings.query(options, {
			signal,
		});
	} catch (error) {
		console.error("[marketing/leaderboard] standings error:", error);
		return null;
	}
}

export async function fetchStats(
	options: RangeQuery = {},
	signal?: AbortSignal,
): Promise<LeaderboardStats | null> {
	try {
		return await leaderboardClient.leaderboard.public.stats.query(options, {
			signal,
		});
	} catch (error) {
		console.error("[marketing/leaderboard] stats error:", error);
		return null;
	}
}

/**
 * Only a real NOT_FOUND means the profile is missing. Transient failures throw
 * so ISR keeps serving the stale page instead of caching a 404 for a live one.
 */
export async function fetchParticipant(
	handle: string,
	options: RangeQuery = {},
): Promise<ParticipantProfile | null> {
	try {
		return await leaderboardClient.leaderboard.public.participant.query({
			handle,
			...options,
		});
	} catch (error) {
		if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
			return null;
		}
		throw error;
	}
}

export async function fetchStanding(
	handle: string,
	options: MetricQuery = {},
	signal?: AbortSignal,
): Promise<StandingRow | null> {
	try {
		return await leaderboardClient.leaderboard.public.standing.query(
			{ handle, ...options },
			{ signal },
		);
	} catch (error) {
		if (signal?.aborted) return null;
		console.error("[marketing/leaderboard] standing error:", error);
		return null;
	}
}

export async function fetchSearch(
	query: string,
	options: MetricQuery = {},
	signal?: AbortSignal,
): Promise<StandingRow[]> {
	try {
		return await leaderboardClient.leaderboard.public.search.query(
			{ query, ...options },
			{ signal },
		);
	} catch (error) {
		if (signal?.aborted) return [];
		console.error("[marketing/leaderboard] search error:", error);
		return [];
	}
}

export async function fetchPublicHandles(): Promise<
	Array<{ handle: string; lastPublishedAt: Date | null }>
> {
	return await leaderboardClient.leaderboard.public.handles.query();
}
