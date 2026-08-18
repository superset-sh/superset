export type UsageProvider = "claude" | "codex";

export type UsageAccountStatus =
	/** Quota fetched successfully. */
	| "ok"
	/** Credentials exist but the OAuth token is expired. We never refresh
	 * tokens ourselves — refreshing from a second client can trip provider
	 * token-reuse protection and sign the user's CLI out. */
	| "token_expired"
	/** Credentials exist but the provider returned no usable quota data
	 * (org-managed/education plans, endpoint changes, transient errors). */
	| "unavailable";

export interface UsageQuotaWindow {
	/** Stable identifier within the account, e.g. "five_hour", "seven_day",
	 * or a model-scoped key. */
	id: string;
	label: string;
	usedPercent: number;
	resetsAt: Date | null;
}

export interface UsageAccount {
	provider: UsageProvider;
	/** Stable key for the credential source (config path or keychain item),
	 * used to dedupe and as a React key. */
	accountKey: string;
	/** Where the credential was found, for display ("~/.claude", "keychain"). */
	sourceLabel: string;
	email: string | null;
	plan: string | null;
	status: UsageAccountStatus;
	/** Human-readable detail for non-ok statuses. */
	statusDetail: string | null;
	windows: UsageQuotaWindow[];
	/** Codex prepaid credits balance, when present. */
	creditsBalance: number | null;
	/** Claude extra-usage spend, in cents, when present. */
	extraUsage: { usedCents: number; limitCents: number } | null;
	fetchedAt: Date;
}
