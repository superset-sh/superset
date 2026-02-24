import {
	getCredentialsFromConfig,
	saveOAuthCredentialsToConfig,
} from "./config-credentials";
import {
	ANTHROPIC_OAUTH_CLIENT_ID,
	ANTHROPIC_OAUTH_TOKEN_URL,
	REFRESH_BUFFER_MS,
	REFRESH_REQUEST_TIMEOUT_MS,
} from "./constants";
import type { ClaudeOAuthCredentials } from "./types";

interface GetOrRefreshAnthropicOAuthCredentialsOptions {
	forceRefresh?: boolean;
	configPaths?: string[];
	fetchImpl?: typeof fetch;
	nowMs?: () => number;
}

const refreshInFlightByConfigPath = new Map<
	string,
	Promise<ClaudeOAuthCredentials | null>
>();

function isExpired(expiresAt: number | undefined, nowMs: number): boolean {
	return typeof expiresAt === "number" && nowMs >= expiresAt;
}

function shouldRefresh(expiresAt: number | undefined, nowMs: number): boolean {
	if (typeof expiresAt !== "number") {
		return false;
	}
	return nowMs + REFRESH_BUFFER_MS >= expiresAt;
}

async function refreshAnthropicOAuthCredentials(
	credentials: ClaudeOAuthCredentials,
	deps: {
		fetchImpl: typeof fetch;
		nowMs: () => number;
	},
): Promise<ClaudeOAuthCredentials | null> {
	if (!credentials.refreshToken) {
		return null;
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, REFRESH_REQUEST_TIMEOUT_MS);

	let response: Response;
	try {
		response = await deps.fetchImpl(ANTHROPIC_OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "refresh_token",
				client_id: ANTHROPIC_OAUTH_CLIENT_ID,
				refresh_token: credentials.refreshToken,
			}),
			signal: abortController.signal,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "AbortError" || error.name === "TimeoutError")
		) {
			throw new Error(
				`Anthropic OAuth refresh timed out after ${REFRESH_REQUEST_TIMEOUT_MS}ms`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Anthropic OAuth refresh failed (${response.status}): ${errorText}`,
		);
	}

	const data = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};

	if (!data.access_token) {
		throw new Error("Anthropic OAuth refresh returned no access token");
	}

	const nextRefreshToken = data.refresh_token || credentials.refreshToken;
	const now = deps.nowMs();
	const nextExpiresAt =
		typeof data.expires_in === "number"
			? now + data.expires_in * 1000
			: Math.max(now + 60 * 60 * 1000, credentials.expiresAt ?? 0);

	saveOAuthCredentialsToConfig(credentials, {
		accessToken: data.access_token,
		refreshToken: nextRefreshToken,
		expiresAt: nextExpiresAt,
	});

	return {
		...credentials,
		apiKey: data.access_token,
		refreshToken: nextRefreshToken,
		expiresAt: nextExpiresAt,
	};
}

/**
 * Resolve Claude OAuth credentials from config and refresh when needed.
 *
 * Returns null when OAuth is unavailable, or when a forced refresh fails.
 */
export async function getOrRefreshAnthropicOAuthCredentials(
	options?: GetOrRefreshAnthropicOAuthCredentialsOptions,
): Promise<ClaudeOAuthCredentials | null> {
	const forceRefresh = options?.forceRefresh ?? false;
	const nowMs = options?.nowMs ?? Date.now;
	const fetchImpl = options?.fetchImpl ?? fetch;
	const credentials = getCredentialsFromConfig({
		configPaths: options?.configPaths,
	});

	if (!credentials || credentials.kind !== "oauth") {
		return null;
	}

	if (!credentials.refreshToken) {
		if (forceRefresh) {
			return null;
		}
		const expired = isExpired(credentials.expiresAt, nowMs());
		if (expired) {
			return null;
		}
		// No refresh token available, keep using existing non-expired access token.
		return credentials;
	}

	const expired = isExpired(credentials.expiresAt, nowMs());
	const refreshNeeded =
		forceRefresh || shouldRefresh(credentials.expiresAt, nowMs());

	if (!refreshNeeded) {
		return credentials;
	}

	const refreshKey = credentials.configPath;
	let refreshInFlight = refreshInFlightByConfigPath.get(refreshKey);
	if (!refreshInFlight) {
		refreshInFlight = refreshAnthropicOAuthCredentials(credentials, {
			fetchImpl,
			nowMs,
		})
			.catch((error) => {
				console.warn("[claude/auth] Failed to refresh OAuth token:", error);
				return null;
			})
			.finally(() => {
				refreshInFlightByConfigPath.delete(refreshKey);
			});
		refreshInFlightByConfigPath.set(refreshKey, refreshInFlight);
	}

	const refreshed = await refreshInFlight;
	if (refreshed) {
		return refreshed;
	}

	// If refresh failed and token is already expired, force caller to re-auth.
	if (forceRefresh || expired) {
		return null;
	}

	return credentials;
}

export function clearAnthropicOAuthRefreshState(): void {
	refreshInFlightByConfigPath.clear();
}
