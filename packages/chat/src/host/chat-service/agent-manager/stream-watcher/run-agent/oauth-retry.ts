export interface OAuthTokenSyncOptions {
	forceRefresh?: boolean;
}

export type OAuthTokenSyncResult = "synced" | "reauth-required" | "unavailable";

export const ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE =
	"anthropic_oauth_reauth_required";
export const ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE =
	"Anthropic OAuth session expired and could not be refreshed. Re-authenticate Claude Code (run `claude auth login`) and try again.";

export type SyncAnthropicOAuthToken = (
	options?: OAuthTokenSyncOptions,
) => Promise<OAuthTokenSyncResult>;

export class AnthropicOAuthReauthRequiredError extends Error {
	readonly code = ANTHROPIC_OAUTH_REAUTH_REQUIRED_ERROR_CODE;

	constructor() {
		super(ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE);
		this.name = "AnthropicOAuthReauthRequiredError";
	}
}

export function isAnthropicOAuthExpiredError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const normalized = message.toLowerCase();

	if (normalized.includes("oauth token has expired")) {
		return true;
	}
	if (
		normalized.includes("authentication_error") &&
		normalized.includes("oauth")
	) {
		return true;
	}
	if (
		normalized.includes("api.anthropic.com") &&
		normalized.includes("token") &&
		normalized.includes("expired")
	) {
		return true;
	}

	return false;
}

export function isAnthropicOAuthReauthRequiredError(error: unknown): boolean {
	return (
		error instanceof AnthropicOAuthReauthRequiredError ||
		(error instanceof Error &&
			error.message.includes(ANTHROPIC_OAUTH_REAUTH_REQUIRED_MESSAGE))
	);
}

export async function withAnthropicOAuthRetry<T>(
	operation: () => Promise<T>,
	options: {
		syncToken: SyncAnthropicOAuthToken;
		onRetry?: () => void;
	},
): Promise<T> {
	const preflightSyncResult = await options.syncToken();
	if (preflightSyncResult === "reauth-required") {
		throw new AnthropicOAuthReauthRequiredError();
	}

	try {
		return await operation();
	} catch (error) {
		if (!isAnthropicOAuthExpiredError(error)) {
			throw error;
		}

		const refreshResult = await options.syncToken({ forceRefresh: true });
		if (refreshResult !== "synced") {
			throw new AnthropicOAuthReauthRequiredError();
		}

		options.onRetry?.();
		return operation();
	}
}
