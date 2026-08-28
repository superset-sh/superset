/**
 * Providers that can appear in usage history/analytics. Quota accounts exist
 * only for "claude" and "codex"; the rest surface transcript-derived token
 * history. Agents whose CLIs record no usable local usage data (gemini, amp,
 * kimi, vibe, kiro, droid, hermes, mastracode) are intentionally absent.
 */
export type UsageProvider =
	| "claude"
	| "codex"
	| "grok"
	| "cursor"
	| "opencode"
	| "copilot"
	| "pi"
	| "omp"
	| "fx";

/** The subset of providers with quota accounts and switchable logins. */
export type UsageAccountProvider = "claude" | "codex";

export type UsageAccountStatus =
	/** Quota fetched successfully. */
	| "ok"
	/** Credentials exist but the OAuth token is expired. We never refresh
	 * tokens ourselves — refreshing from a second client can trip provider
	 * token-reuse protection and sign the user's CLI out. */
	| "token_expired"
	/** Credentials exist but the provider returned no usable quota data
	 * (org-managed/education plans, endpoint changes, transient errors). */
	| "unavailable"
	/** A profile dir with an identity but no readable credential (logged out
	 * or a half-finished login). Surfaced so it can be re-signed or removed;
	 * a signed-out Codex home is undetectable (its auth.json is gone). */
	| "signed_out";

export interface UsageQuotaWindow {
	/** Stable identifier within the account, e.g. "five_hour", "seven_day",
	 * or a model-scoped key. */
	id: string;
	label: string;
	usedPercent: number;
	resetsAt: Date | null;
}

export interface UsageAccount {
	provider: UsageAccountProvider;
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
	/** Profile dir to inject into agent launches (CLAUDE_CONFIG_DIR /
	 * CODEX_HOME) to run on this account. Null for the system-default login,
	 * which needs no override. */
	selection: string | null;
	/** Whether newly launched agents use this account (host-wide default). */
	isDefault: boolean;
	fetchedAt: Date;
}
