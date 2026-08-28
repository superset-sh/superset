import type { DayRange, LeaderboardPeriod } from "./periods";

export type LeaderboardMetric = "tokens" | "cost";

export interface StandingRow {
	rank: number;
	handle: string;
	name: string | null;
	tokens: number;
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
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
	reasoningOutput: number;
}

export interface LeaderboardStats {
	period: LeaderboardPeriod;
	range: DayRange | null;
	totals: {
		participants: number;
		tokens: number;
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
			tokens: number;
		}>;
		byTokens: Array<{
			provider: string;
			model: string;
			usd: string;
			tokens: number;
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
		tokens: number;
		usd: string;
		sessions: number;
		approximate: boolean;
	};
	window: {
		range: DayRange | null;
		tokens: number;
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
		tokens: number;
		usd: string;
	}>;
	daily: Array<{ day: string; tokens: number; usd: string }>;
}
