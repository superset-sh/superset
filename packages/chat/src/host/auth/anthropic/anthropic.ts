/**
 * Claude Code authentication resolution.
 *
 * Reads Claude credentials from:
 * 1. Claude config file (~/.claude.json or ~/.config/claude/credentials.json)
 * 2. macOS Keychain (via security command)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const ANTHROPIC_OAUTH_TOKEN_URL =
	"https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_OAUTH_CLIENT_ID = Buffer.from(
	"OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
	"base64",
).toString("utf8");
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface ClaudeCredentialBase {
	apiKey: string;
	source: "config" | "keychain";
	kind: "apiKey" | "oauth";
}

export interface ClaudeApiKeyCredentials extends ClaudeCredentialBase {
	kind: "apiKey";
}

export interface ClaudeOAuthCredentials extends ClaudeCredentialBase {
	kind: "oauth";
	source: "config";
	refreshToken?: string;
	expiresAt?: number;
	configPath: string;
}

export type ClaudeCredentials =
	| ClaudeApiKeyCredentials
	| ClaudeOAuthCredentials;

interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
	oauthRefreshToken?: string;
	oauth_refresh_token?: string;
	oauthExpiresAt?: number | string;
	oauth_expires_at?: number | string;
	claudeAiOauth?: {
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number | string;
	};
}

let refreshInFlight: Promise<ClaudeOAuthCredentials | null> | null = null;

function normalizeExpiry(value: unknown): number | undefined {
	if (typeof value !== "number" && typeof value !== "string") {
		return undefined;
	}
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return undefined;
	}

	// Handle both epoch seconds and epoch milliseconds.
	return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function isExpired(expiresAt?: number): boolean {
	return typeof expiresAt === "number" && Date.now() >= expiresAt;
}

function shouldRefresh(expiresAt?: number): boolean {
	if (typeof expiresAt !== "number") {
		return false;
	}
	return Date.now() + REFRESH_BUFFER_MS >= expiresAt;
}

function parseConfigCredentials(
	configPath: string,
	config: ClaudeConfigFile,
): ClaudeCredentials | null {
	if (config.claudeAiOauth?.accessToken) {
		return {
			apiKey: config.claudeAiOauth.accessToken,
			source: "config",
			kind: "oauth",
			refreshToken: config.claudeAiOauth.refreshToken,
			expiresAt: normalizeExpiry(config.claudeAiOauth.expiresAt),
			configPath,
		};
	}

	const apiKey = config.apiKey || config.api_key;
	const oauthAccessToken = config.oauthAccessToken || config.oauth_access_token;
	const oauthRefreshToken =
		config.oauthRefreshToken || config.oauth_refresh_token;
	const oauthExpiresAt = normalizeExpiry(
		config.oauthExpiresAt || config.oauth_expires_at,
	);

	if (apiKey) {
		return { apiKey, source: "config", kind: "apiKey" };
	}

	if (oauthAccessToken) {
		return {
			apiKey: oauthAccessToken,
			source: "config",
			kind: "oauth",
			refreshToken: oauthRefreshToken,
			expiresAt: oauthExpiresAt,
			configPath,
		};
	}

	return null;
}

export function getCredentialsFromConfig(): ClaudeCredentials | null {
	const home = homedir();
	const configPaths = [
		join(home, ".claude", ".credentials.json"),
		join(home, ".claude.json"),
		join(home, ".config", "claude", "credentials.json"),
		join(home, ".config", "claude", "config.json"),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, "utf-8");
				const config: ClaudeConfigFile = JSON.parse(content);
				const credentials = parseConfigCredentials(configPath, config);
				if (credentials) return credentials;
			} catch (error) {
				console.warn(
					`[claude/auth] Failed to parse config at ${configPath}:`,
					error,
				);
			}
		}
	}

	return null;
}

function saveOAuthCredentialsToConfig(
	credentials: ClaudeOAuthCredentials,
	refreshed: { accessToken: string; refreshToken: string; expiresAt: number },
) {
	const content = readFileSync(credentials.configPath, "utf-8");
	const config: ClaudeConfigFile = JSON.parse(content);

	if (config.claudeAiOauth) {
		config.claudeAiOauth = {
			...config.claudeAiOauth,
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken,
			expiresAt: refreshed.expiresAt,
		};
	} else {
		const useSnakeCase =
			typeof config.oauth_access_token === "string" ||
			typeof config.oauth_refresh_token === "string" ||
			typeof config.oauth_expires_at !== "undefined";

		if (useSnakeCase) {
			config.oauth_access_token = refreshed.accessToken;
			config.oauth_refresh_token = refreshed.refreshToken;
			config.oauth_expires_at = refreshed.expiresAt;
		} else {
			config.oauthAccessToken = refreshed.accessToken;
			config.oauthRefreshToken = refreshed.refreshToken;
			config.oauthExpiresAt = refreshed.expiresAt;
		}
	}

	writeFileSync(credentials.configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function refreshAnthropicOAuthCredentials(
	credentials: ClaudeOAuthCredentials,
): Promise<ClaudeOAuthCredentials | null> {
	if (!credentials.refreshToken) {
		return null;
	}

	const response = await fetch(ANTHROPIC_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "refresh_token",
			client_id: ANTHROPIC_OAUTH_CLIENT_ID,
			refresh_token: credentials.refreshToken,
		}),
	});

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
	const nextExpiresAt =
		typeof data.expires_in === "number"
			? Date.now() + data.expires_in * 1000
			: (credentials.expiresAt ?? Date.now() + 60 * 60 * 1000);

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
export async function getOrRefreshAnthropicOAuthCredentials(options?: {
	forceRefresh?: boolean;
}): Promise<ClaudeOAuthCredentials | null> {
	const forceRefresh = options?.forceRefresh ?? false;
	const credentials = getCredentialsFromConfig();

	if (!credentials || credentials.kind !== "oauth") {
		return null;
	}

	if (!credentials.refreshToken) {
		// No refresh token available, keep using existing access token.
		return credentials;
	}

	const expired = isExpired(credentials.expiresAt);
	const refreshNeeded = forceRefresh || shouldRefresh(credentials.expiresAt);

	if (!refreshNeeded) {
		return credentials;
	}

	if (!refreshInFlight) {
		refreshInFlight = refreshAnthropicOAuthCredentials(credentials)
			.catch((error) => {
				console.warn("[claude/auth] Failed to refresh OAuth token:", error);
				return null;
			})
			.finally(() => {
				refreshInFlight = null;
			});
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

export function getCredentialsFromKeychain(): ClaudeCredentials | null {
	if (platform() !== "darwin") {
		return null;
	}

	try {
		const result = execSync(
			'security find-generic-password -s "claude-cli" -a "api-key" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (result) {
			console.log("[claude/auth] Found credentials in macOS Keychain");
			return { apiKey: result, source: "keychain", kind: "apiKey" };
		}
	} catch {
		// Not found in keychain
	}

	try {
		const result = execSync(
			'security find-generic-password -s "anthropic-api-key" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (result) {
			console.log(
				"[claude/auth] Found credentials in macOS Keychain (anthropic-api-key)",
			);
			return { apiKey: result, source: "keychain", kind: "apiKey" };
		}
	} catch {
		// Not found in keychain
	}

	return null;
}
