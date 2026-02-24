import { setAnthropicAuthToken } from "@superset/agent";
import {
	getCredentialsFromConfig,
	getOrRefreshAnthropicOAuthCredentials,
} from "../../../../auth/anthropic";
import {
	type OAuthTokenSyncOptions,
	type OAuthTokenSyncResult,
	withAnthropicOAuthRetry,
} from "./oauth-retry";

export async function syncAnthropicOAuthToken(
	options?: OAuthTokenSyncOptions,
): Promise<OAuthTokenSyncResult> {
	const configuredCredentials = getCredentialsFromConfig();
	const hasConfiguredOAuthCredentials = configuredCredentials?.kind === "oauth";

	try {
		const oauthCredentials = await getOrRefreshAnthropicOAuthCredentials({
			forceRefresh: options?.forceRefresh,
		});

		if (!oauthCredentials) {
			setAnthropicAuthToken(null);
			return hasConfiguredOAuthCredentials ? "reauth-required" : "unavailable";
		}

		setAnthropicAuthToken(oauthCredentials.apiKey);
		return "synced";
	} catch (error) {
		console.warn("[run-agent] Failed to sync Anthropic OAuth token:", error);
		if (hasConfiguredOAuthCredentials || options?.forceRefresh) {
			setAnthropicAuthToken(null);
			return "reauth-required";
		}
		return "unavailable";
	}
}

export async function runWithAnthropicOAuthRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	return withAnthropicOAuthRetry(operation, {
		syncToken: syncAnthropicOAuthToken,
		onRetry: () => {
			console.warn(
				"[run-agent] Retrying agent call after Anthropic OAuth refresh",
			);
		},
	});
}
