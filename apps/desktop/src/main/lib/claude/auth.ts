/**
 * Claude Code authentication resolution.
 *
 * Reads Claude credentials from various sources:
 * 1. Environment variable (ANTHROPIC_API_KEY)
 * 2. Claude config file (~/.claude.json or ~/.config/claude/credentials.json)
 * 3. macOS Keychain (via security command)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

interface ClaudeCredentials {
	apiKey: string;
	source: "env" | "config" | "keychain";
}

interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
}

/**
 * Get Claude credentials from environment variable.
 */
function getCredentialsFromEnv(): ClaudeCredentials | null {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (apiKey) {
		return { apiKey, source: "env" };
	}
	return null;
}

/**
 * Get Claude credentials from config file.
 */
function getCredentialsFromConfig(): ClaudeCredentials | null {
	const home = homedir();
	const configPaths = [
		join(home, ".claude.json"),
		join(home, ".config", "claude", "credentials.json"),
		join(home, ".config", "claude", "config.json"),
	];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const content = readFileSync(configPath, "utf-8");
				const config: ClaudeConfigFile = JSON.parse(content);
				const apiKey =
					config.apiKey ||
					config.api_key ||
					config.oauthAccessToken ||
					config.oauth_access_token;

				if (apiKey) {
					console.log(`[claude/auth] Found credentials in: ${configPath}`);
					return { apiKey, source: "config" };
				}
			} catch (error) {
				console.warn(`[claude/auth] Failed to parse config at ${configPath}:`, error);
			}
		}
	}

	return null;
}

/**
 * Get Claude credentials from macOS Keychain.
 */
function getCredentialsFromKeychain(): ClaudeCredentials | null {
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
			return { apiKey: result, source: "keychain" };
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
			console.log("[claude/auth] Found credentials in macOS Keychain (anthropic-api-key)");
			return { apiKey: result, source: "keychain" };
		}
	} catch {
		// Not found in keychain, this is fine
	}

	return null;
}

/**
 * Get existing Claude credentials from any available source.
 *
 * Priority:
 * 1. Environment variable (ANTHROPIC_API_KEY)
 * 2. Config file (~/.claude.json, ~/.config/claude/credentials.json)
 * 3. macOS Keychain
 */
export function getExistingClaudeCredentials(): ClaudeCredentials | null {
	// 1. Check environment variable
	const envCredentials = getCredentialsFromEnv();
	if (envCredentials) {
		console.log("[claude/auth] Using credentials from environment variable");
		return envCredentials;
	}

	// 2. Check config file
	const configCredentials = getCredentialsFromConfig();
	if (configCredentials) {
		return configCredentials;
	}

	// 3. Check macOS Keychain
	const keychainCredentials = getCredentialsFromKeychain();
	if (keychainCredentials) {
		return keychainCredentials;
	}

	console.warn("[claude/auth] No Claude credentials found");
	return null;
}

/**
 * Build environment variables for running Claude CLI.
 * Includes the API key if available.
 */
export function buildClaudeEnv(): Record<string, string> {
	const env: Record<string, string> = {
		...process.env,
	} as Record<string, string>;

	const credentials = getExistingClaudeCredentials();
	if (credentials) {
		env.ANTHROPIC_API_KEY = credentials.apiKey;
	}

	// Ensure PATH includes common binary locations
	const pathAdditions = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"];
	const currentPath = env.PATH || "";
	const pathParts = currentPath.split(":");

	for (const addition of pathAdditions) {
		if (!pathParts.includes(addition)) {
			pathParts.push(addition);
		}
	}

	env.PATH = pathParts.join(":");

	return env;
}

/**
 * Check if Claude credentials are available.
 */
export function hasClaudeCredentials(): boolean {
	return getExistingClaudeCredentials() !== null;
}
