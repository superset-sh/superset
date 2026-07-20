export type ProviderId = "claude" | "codex" | "copilot" | "gemini";

export type ProviderStatus =
	| "ok"
	| "auth-error"
	| "no-credentials"
	| "unsupported"
	| "loading";

export interface RateLimitWindow {
	label: string;
	usedPct: number;
	resetAt: Date | null;
	lastsUntilReset: boolean;
	reservePct: number;
}

export interface DailyBucket {
	date: string;
	tokens: number;
	usd: number;
}

export interface CostStats {
	todayUsd: number;
	thirtyDayUsd: number;
	thirtyDayTokens: number;
	latestSessionTokens: number;
	topModel: string | null;
	dailyBuckets: DailyBucket[];
	estimatedFromLogs: boolean;
	/** True when at least one model fell back to the provider's cheapest rate. */
	approximate: boolean;
}

export interface ProviderCredits {
	balance: number;
	resetCredits: number;
}

export interface ProviderSnapshot {
	providerId: ProviderId;
	status: ProviderStatus;
	updatedAt: Date;
	email: string | null;
	planLabel: string | null;
	windows: RateLimitWindow[];
	credits: ProviderCredits | null;
	cost: CostStats | null;
	errorMessage: string | null;
}

export interface UsageDisplaySettings {
	showSidebarBadge: boolean;
	showTrayPercentage: boolean;
	notifyAt80Pct: boolean;
	notifyAt95Pct: boolean;
}

export const DEFAULT_USAGE_DISPLAY_SETTINGS: UsageDisplaySettings = {
	showSidebarBadge: true,
	showTrayPercentage: true,
	notifyAt80Pct: true,
	notifyAt95Pct: true,
};

export const USAGE_PROVIDER_LABELS: Record<ProviderId, string> = {
	claude: "Claude",
	codex: "Codex",
	copilot: "Copilot",
	gemini: "Gemini",
};

/** Highest used-percentage across all windows of a snapshot, or null if none. */
export function worstWindowUsedPct(snapshot: ProviderSnapshot): number | null {
	if (snapshot.windows.length === 0) return null;
	return snapshot.windows.reduce(
		(max, window) => Math.max(max, window.usedPct),
		0,
	);
}

/** Highest used-percentage across every provider that has window data. */
export function worstWindowAcrossProviders(
	snapshots: ProviderSnapshot[],
): number | null {
	let worst: number | null = null;
	for (const snapshot of snapshots) {
		const pct = worstWindowUsedPct(snapshot);
		if (pct === null) continue;
		worst = worst === null ? pct : Math.max(worst, pct);
	}
	return worst;
}
