export const ANTHROPIC_OAUTH_REAUTH_ERROR_CODE =
	"anthropic_oauth_reauth_required";

export const ANTHROPIC_CONSOLE_URL = "https://console.anthropic.com";

export interface ErrorPartLike {
	type: "error";
	text: string;
	code?: string;
}

export interface OAuthReauthErrorUi {
	kind: "oauth-reauth";
	title: string;
	description: string;
	actionLabel: string;
	actionUrl: string;
}

export function resolveOAuthReauthErrorUi(
	part: ErrorPartLike,
): OAuthReauthErrorUi | null {
	if (part.code === ANTHROPIC_OAUTH_REAUTH_ERROR_CODE) {
		return {
			kind: "oauth-reauth",
			title: "Claude authentication required",
			description:
				"Your Anthropic OAuth session expired and could not be refreshed. Run `claude auth login` in your terminal, then retry.",
			actionLabel: "Open Anthropic Console",
			actionUrl: ANTHROPIC_CONSOLE_URL,
		};
	}

	const normalized = part.text.toLowerCase();
	const looksLikeOAuthReauthIssue =
		normalized.includes("oauth token has expired") ||
		normalized.includes("oauth token expired") ||
		(normalized.includes("oauth") &&
			normalized.includes("could not be refreshed")) ||
		(normalized.includes("oauth") && normalized.includes("re-authenticate"));

	if (!looksLikeOAuthReauthIssue) {
		return null;
	}

	return {
		kind: "oauth-reauth",
		title: "Claude authentication required",
		description:
			"Your Anthropic OAuth session expired and could not be refreshed. Run `claude auth login` in your terminal, then retry.",
		actionLabel: "Open Anthropic Console",
		actionUrl: ANTHROPIC_CONSOLE_URL,
	};
}
