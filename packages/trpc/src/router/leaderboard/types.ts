import type { DayRange, LeaderboardPeriod } from "./periods";

export type LeaderboardMetric = "tokens" | "cost";

export interface StandingRow {
	rank: number;
	handle: string;
	name: string | null;
	tokens: string;
	usd: string;
	sessions: number;
	approximate: boolean;
	tier: number;
}

export interface StandingsResult {
	period: LeaderboardPeriod;
	metric: LeaderboardMetric;
	range: DayRange | null;
	rows: StandingRow[];
	total: number;
	hasMore: boolean;
}

export interface TierDistribution {
	distribution: number[];
	ranked: number;
	mode: number;
	position: number;
}

export interface TokenSplit {
	uncachedInput: string;
	cachedInput: string;
	cacheWrite5m: string;
	cacheWrite1h: string;
	output: string;
	reasoningOutput: string;
}

export interface LeaderboardStats {
	period: LeaderboardPeriod;
	range: DayRange | null;
	totals: {
		participants: number;
		tokens: string;
		usd: string;
		sessions: number;
	};
	tokenSplit: TokenSplit;
	models: {
		byUsers: Array<{ provider: string; model: string; users: number }>;
		bySpend: Array<{
			provider: string;
			model: string;
			usd: string;
			tokens: string;
		}>;
		byTokens: Array<{
			provider: string;
			model: string;
			usd: string;
			tokens: string;
		}>;
	};
	tiers: TierDistribution;
}

export interface ParticipantProfile {
	handle: string;
	name: string | null;
	joinedAt: Date;
	lastPublishedAt: Date | null;
	dayRange: DayRange | null;
	allTime: {
		tokens: string;
		usd: string;
		sessions: number;
		approximate: boolean;
	};
	window: {
		range: DayRange | null;
		tokens: string;
		usd: string;
		sessions: number;
	};
	rank: number;
	total: number;
	factory: {
		tier: number;
		progress: number;
		computedAt: Date | null;
	};
	tokenSplit: TokenSplit;
	models: Array<{
		provider: string;
		model: string;
		tokens: string;
		usd: string;
	}>;
	daily: Array<{ day: string; tokens: string; usd: string }>;
}
