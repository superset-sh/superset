/**
 * Claude's `rate_limit_info`, as the CLI streams it and as the ACP agent
 * forwards it under `_meta["_claude/rateLimit"]`. `resetsAt` is in seconds.
 */
export type RefusedWindow =
	/** Requests are refused; the window reopens at this time, when known. */
	| { resetsAtMs?: number; window?: string }
	/** Requests are allowed, or a refusal is being paid for by extra usage. */
	| null;

export function refusedWindow(rateLimitInfo: unknown): RefusedWindow {
	const info =
		typeof rateLimitInfo === "object" &&
		rateLimitInfo !== null &&
		!Array.isArray(rateLimitInfo)
			? (rateLimitInfo as Record<string, unknown>)
			: null;
	if (!info || info.status !== "rejected" || info.isUsingOverage === true) {
		return null;
	}
	const resetsAt = info.resetsAt;
	const window =
		typeof info.rateLimitType === "string" ? info.rateLimitType : undefined;
	return {
		...(typeof resetsAt === "number" && resetsAt > 0
			? { resetsAtMs: resetsAt < 1e12 ? resetsAt * 1000 : resetsAt }
			: {}),
		...(window ? { window } : {}),
	};
}

/** The CLI's own words for the refusal, when no event said so. */
export const USAGE_LIMIT_TEXT =
	/hit your (?:usage )?limit|usage limit reached/i;
