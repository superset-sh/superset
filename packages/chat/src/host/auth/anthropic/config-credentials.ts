import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ClaudeConfigFile,
	ClaudeCredentials,
	ClaudeOAuthCredentials,
	GetCredentialsFromConfigOptions,
} from "./types";

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

export function getClaudeConfigPaths(home = homedir()): string[] {
	return [
		join(home, ".claude", ".credentials.json"),
		join(home, ".claude.json"),
		join(home, ".config", "claude", "credentials.json"),
		join(home, ".config", "claude", "config.json"),
	];
}

export function getCredentialsFromConfig(
	options?: GetCredentialsFromConfigOptions,
): ClaudeCredentials | null {
	const configPaths = options?.configPaths ?? getClaudeConfigPaths();

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

export function saveOAuthCredentialsToConfig(
	credentials: ClaudeOAuthCredentials,
	refreshed: { accessToken: string; refreshToken: string; expiresAt: number },
): void {
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
