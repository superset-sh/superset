/**
 * Claude Code authentication resolution.
 *
 * Reads Claude credentials from:
 * 1. Claude config file (~/.claude.json or ~/.config/claude/credentials.json)
 * 2. macOS Keychain (via security command)
 *
 * IMPORTANT: ANTHROPIC_API_KEY and OPENAI_API_KEY are never read from or
 * written to process.env.  Credentials are passed in-memory via the agent
 * package's setAnthropicAuthToken helper (OAuth only).
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";

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

	// Claude Code stores OAuth credentials under "Claude Code-credentials"
	// as a JSON blob with the same shape as ClaudeConfigFile.
	try {
		const raw = execSync(
			'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (raw) {
			try {
				const config: ClaudeConfigFile = JSON.parse(raw);
				if (config.claudeAiOauth?.accessToken) {
					console.log(
						"[claude/auth] Found OAuth credentials in macOS Keychain (Claude Code-credentials)",
					);
					return {
						apiKey: config.claudeAiOauth.accessToken,
						source: "keychain",
						kind: "oauth",
					};
				}
			} catch {
				// Not valid JSON — treat as raw API key
				console.log(
					"[claude/auth] Found raw credentials in macOS Keychain (Claude Code-credentials)",
				);
				return { apiKey: raw, source: "keychain", kind: "apiKey" };
			}
		}
	} catch {
		// Not found in keychain, this is fine
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
		// Not found in keychain, this is fine
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
		// Not found in keychain, this is fine
	}

	return null;
}

/**
 * Get existing Claude credentials from any available source.
 *
 * Priority:
 * 1. Config file (~/.claude.json, ~/.config/claude/credentials.json)
 * 2. macOS Keychain
 *
 * Note: Environment variables are intentionally NOT checked — the desktop app
 * must never read ANTHROPIC_API_KEY or OPENAI_API_KEY from process.env.
 */
export function getExistingClaudeCredentials(): ClaudeCredentials | null {
	// 1. Check config file
	const configCredentials = getCredentialsFromConfig();
	if (configCredentials) {
		return configCredentials;
	}

	// 2. Check macOS Keychain
	const keychainCredentials = getCredentialsFromKeychain();
	if (keychainCredentials) {
		return keychainCredentials;
	}

	console.warn("[claude/auth] No Claude credentials found");
	return null;
}

/** Keys that must never leak into spawned processes. */
const STRIPPED_ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

/**
 * Build environment variables for running Claude CLI.
 *
 * OAuth credentials are handled by the binary itself (from ~/.claude/.credentials.json).
 * ANTHROPIC_API_KEY and OPENAI_API_KEY are explicitly stripped to prevent leakage.
 */
export function buildClaudeEnv(): Record<string, string> {
	const env: Record<string, string> = {
		...process.env,
	} as Record<string, string>;

	// Strip secret API keys — the desktop app uses OAuth only
	for (const key of STRIPPED_ENV_KEYS) {
		delete env[key];
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
 * Check if Claude credentials are available.
 */
export function hasClaudeCredentials(): boolean {
	return getExistingClaudeCredentials() !== null;
}
