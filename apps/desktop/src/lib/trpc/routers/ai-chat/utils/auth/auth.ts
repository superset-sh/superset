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
import { delimiter, join } from "node:path";

interface ClaudeCredentials {
	apiKey: string;
	source: "env" | "config" | "keychain";
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
 * Get Claude credentials from environment variable.
 */
function getCredentialsFromEnv(): ClaudeCredentials | null {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (apiKey) {
		return { apiKey, source: "env", kind: "apiKey" };
	}
	return null;
}

/**
 * Get Claude credentials from config file.
 */
function getCredentialsFromConfig(): ClaudeCredentials | null {
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
 *
 * IMPORTANT: We do NOT set ANTHROPIC_API_KEY when using OAuth credentials.
 * The Claude binary handles its own OAuth authentication from ~/.claude/.credentials.json.
 * Setting ANTHROPIC_API_KEY to an OAuth token causes authentication failure.
 *
 * We only set ANTHROPIC_API_KEY if:
 * 1. It's already in the environment (user explicitly set it)
 * 2. We found a raw API key (not OAuth) in config
 */
export function buildClaudeEnv(): Record<string, string> {
	const env: Record<string, string> = {
		...process.env,
	} as Record<string, string>;

	// Check if user has OAuth credentials - if so, let the binary handle auth
	const hasOAuth = hasClaudeOAuthCredentials();
	if (hasOAuth) {
		console.log(
			"[claude/auth] OAuth credentials found - letting binary handle authentication",
		);
		// Don't set ANTHROPIC_API_KEY, let the binary use its own OAuth flow
	} else {
		// Only set ANTHROPIC_API_KEY if we have a raw API key (not OAuth)
		const credentials = getExistingClaudeCredentials();
		if (credentials?.kind === "apiKey") {
			env.ANTHROPIC_API_KEY = credentials.apiKey;
			console.log(`[claude/auth] Using API key from ${credentials.source}`);
		}
	}

	// Ensure PATH includes common binary locations (non-Windows only)
	if (platform() !== "win32") {
		const pathAdditions = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"];
		const currentPath = env.PATH || "";
		const pathParts = currentPath.split(delimiter);

		for (const addition of pathAdditions) {
			if (!pathParts.includes(addition)) {
				pathParts.push(addition);
			}
		}

		env.PATH = pathParts.join(delimiter);
	}

	// Mark as SDK entry (like 1code does)
	env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";

	return env;
}

/**
 * Check if Claude OAuth credentials are available.
 */
function hasClaudeOAuthCredentials(): boolean {
	const home = homedir();
	const credentialsPath = join(home, ".claude", ".credentials.json");

	if (existsSync(credentialsPath)) {
		try {
			const content = readFileSync(credentialsPath, "utf-8");
			const config: ClaudeConfigFile = JSON.parse(content);
			return !!config.claudeAiOauth?.accessToken;
		} catch {
			return false;
		}
	}
	return false;
}

/**
 * Check if Claude credentials are available.
 */
export function hasClaudeCredentials(): boolean {
	return getExistingClaudeCredentials() !== null;
}
