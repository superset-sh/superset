/**
 * Claude Code authentication resolution.
 *
 * Reads Claude credentials from:
 * 1. Claude config file (~/.claude.json or ~/.config/claude/credentials.json)
 * 2. macOS Keychain (via security command)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

interface ClaudeCredentials {
	apiKey: string;
	source: "config" | "keychain";
	kind: "apiKey" | "oauth";
}

interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
	// Claude Code CLI format
	claudeAiOauth?: {
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
	};
}

/**
 * Get Claude credentials from config file.
 */
export function getCredentialsFromConfig(): ClaudeCredentials | null {
	const home = homedir();
	// Check Claude Code CLI credentials first (most common case)
	const configPaths = [
		join(home, ".claude", ".credentials.json"), // Claude Code CLI
		join(home, ".claude.json"),
		join(home, ".config", "claude", "credentials.json"),
		join(home, ".config", "claude", "config.json"),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, "utf-8");
				const config: ClaudeConfigFile = JSON.parse(content);

				// Check for Claude Code CLI OAuth format first
				if (config.claudeAiOauth?.accessToken) {
					console.log(
						`[claude/auth] Found OAuth credentials in: ${configPath}`,
					);
					return {
						apiKey: config.claudeAiOauth.accessToken,
						source: "config",
						kind: "oauth",
					};
				}

				// Fall back to other formats
				const apiKey = config.apiKey || config.api_key;
				const oauthAccessToken =
					config.oauthAccessToken || config.oauth_access_token;

				if (apiKey) {
					console.log(`[claude/auth] Found credentials in: ${configPath}`);
					return { apiKey, source: "config", kind: "apiKey" };
				}

				if (oauthAccessToken) {
					console.log(
						`[claude/auth] Found OAuth credentials in: ${configPath}`,
					);
					return {
						apiKey: oauthAccessToken,
						source: "config",
						kind: "oauth",
					};
				}
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

/**
 * Get Claude credentials from macOS Keychain.
 */
export function getCredentialsFromKeychain(): ClaudeCredentials | null {
	if (platform() !== "darwin") {
		return null;
	}

	try {
		// Claude CLI stores credentials in the keychain with this service/account
		const result = execSync(
			'security find-generic-password -s "claude-cli" -a "api-key" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (result) {
			console.log("[claude/auth] Found credentials in macOS Keychain");
			return { apiKey: result, source: "keychain", kind: "apiKey" };
		}
	} catch {
		// Not found in keychain, this is fine
	}

	// Try alternate keychain entry format
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
		// Not found in keychain, this is fine
	}

	return null;
}
