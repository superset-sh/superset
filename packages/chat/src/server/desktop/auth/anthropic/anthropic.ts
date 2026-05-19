/**
 * Claude Code authentication resolution.
 *
 * Reads Claude credentials from:
 * 1. Claude config file (~/.claude.json or ~/.config/claude/credentials.json)
 * 2. macOS Keychain (via security command)
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAuthStorage } from "mastracode";
import { ANTHROPIC_AUTH_PROVIDER_ID } from "../provider-ids";
import { probeAnthropicKeychain } from "./keychain";

export { clearAnthropicKeychainCache } from "./keychain";

export interface ClaudeCredentials {
	apiKey: string;
	source: "config" | "keychain" | "auth-storage";
	kind: "apiKey" | "oauth";
	expiresAt?: number;
}

export type AnthropicProviderOptions =
	| { apiKey: string }
	| {
			authToken: string;
			headers: {
				"anthropic-beta": string;
				"user-agent": string;
				"x-app": string;
			};
	  };

export function getAnthropicProviderOptions(
	credentials: ClaudeCredentials,
): AnthropicProviderOptions {
	if (credentials.kind === "oauth") {
		return {
			authToken: credentials.apiKey,
			headers: {
				"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
				"user-agent": "claude-cli/2.1.2 (external, cli)",
				"x-app": "cli",
			},
		};
	}

	return {
		apiKey: credentials.apiKey,
	};
}

interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
	claudeAiOauth?: {
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
	};
}

export function isClaudeCredentialExpired(
	credential: Pick<ClaudeCredentials, "kind" | "expiresAt">,
): boolean {
	return (
		credential.kind === "oauth" &&
		typeof credential.expiresAt === "number" &&
		Date.now() >= credential.expiresAt
	);
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

				if (config.claudeAiOauth?.accessToken) {
					console.log(
						`[claude/auth] Found OAuth credentials in: ${configPath}`,
					);
					return {
						apiKey: config.claudeAiOauth.accessToken,
						source: "config",
						kind: "oauth",
						expiresAt: config.claudeAiOauth.expiresAt,
					};
				}

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

export function getCredentialsFromKeychain(): ClaudeCredentials | null {
	const probe = probeAnthropicKeychain();
	if (!probe) return null;
	if (probe.service === "claude-cli") {
		console.log("[claude/auth] Found credentials in macOS Keychain");
	} else {
		console.log(
			"[claude/auth] Found credentials in macOS Keychain (anthropic-api-key)",
		);
	}
	return { apiKey: probe.apiKey, source: "keychain", kind: "apiKey" };
}

export async function getCredentialsFromAuthStorage(): Promise<ClaudeCredentials | null> {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
		if (!credential) return null;

		if (
			credential.type === "api_key" &&
			typeof credential.key === "string" &&
			credential.key.trim().length > 0
		) {
			return {
				apiKey: credential.key.trim(),
				source: "auth-storage",
				kind: "apiKey",
			};
		}

		if (credential.type === "oauth") {
			// mastracode's getApiKey triggers refreshToken() when expires <= now,
			// and persists the refreshed credential back into auth storage.
			const accessToken = await authStorage.getApiKey(
				ANTHROPIC_AUTH_PROVIDER_ID,
			);
			if (!accessToken || accessToken.trim().length === 0) return null;
			authStorage.reload();
			const refreshed = authStorage.get(ANTHROPIC_AUTH_PROVIDER_ID);
			return {
				apiKey: accessToken.trim(),
				source: "auth-storage",
				kind: "oauth",
				expiresAt:
					refreshed?.type === "oauth" && typeof refreshed.expires === "number"
						? refreshed.expires
						: undefined,
			};
		}
	} catch (error) {
		console.warn("[claude/auth] Failed to read auth storage:", error);
	}

	return null;
}

export async function getCredentialsFromAnySource(): Promise<ClaudeCredentials | null> {
	const syncResolvers = [getCredentialsFromConfig, getCredentialsFromKeychain];
	let firstExpired: ClaudeCredentials | null = null;

	for (const resolve of syncResolvers) {
		const credential = resolve();
		if (!credential) continue;
		if (!isClaudeCredentialExpired(credential)) return credential;
		firstExpired ??= credential;
	}

	const storageCredential = await getCredentialsFromAuthStorage();
	if (storageCredential && !isClaudeCredentialExpired(storageCredential)) {
		return storageCredential;
	}
	firstExpired ??= storageCredential ?? null;

	return firstExpired;
}
