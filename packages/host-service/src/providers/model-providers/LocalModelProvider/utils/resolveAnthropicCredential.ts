import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createAuthStorage } from "mastracode";
import type { LocalResolvedCredential } from "./credentials";
import { isObjectRecord } from "./credentials";

const ANTHROPIC_PROVIDER_ID = "anthropic";

interface ClaudeConfigFile {
	apiKey?: string;
	api_key?: string;
	oauthAccessToken?: string;
	oauth_access_token?: string;
	claudeAiOauth?: {
		accessToken?: string;
		expiresAt?: number;
	};
}

function getClaudeConfigPaths(): string[] {
	const home = homedir();
	return [
		join(home, ".claude", ".credentials.json"),
		join(home, ".claude.json"),
		join(home, ".config", "claude", "credentials.json"),
		join(home, ".config", "claude", "config.json"),
	];
}

function getAnthropicCredentialFromConfig(): LocalResolvedCredential | null {
	for (const configPath of getClaudeConfigPaths()) {
		if (!existsSync(configPath)) continue;

		try {
			const content = readFileSync(configPath, "utf-8");
			const config = JSON.parse(content) as ClaudeConfigFile;
			const oauthAccessToken =
				config.claudeAiOauth?.accessToken ??
				config.oauthAccessToken ??
				config.oauth_access_token;

			if (oauthAccessToken) {
				return {
					kind: "oauth",
					expiresAt: config.claudeAiOauth?.expiresAt,
				};
			}

			const apiKey = config.apiKey ?? config.api_key;
			if (apiKey) {
				return { kind: "api_key" };
			}
		} catch {
			// Ignore invalid local Claude config files.
		}
	}

	return null;
}

function getAnthropicCredentialFromKeychain(): LocalResolvedCredential | null {
	if (platform() !== "darwin") return null;

	const commands = [
		'security find-generic-password -s "claude-cli" -a "api-key" -w 2>/dev/null',
		'security find-generic-password -s "anthropic-api-key" -w 2>/dev/null',
	];

	for (const command of commands) {
		try {
			const apiKey = execSync(command, { encoding: "utf-8" }).trim();
			if (apiKey) {
				return { kind: "api_key" };
			}
		} catch {
			// Ignore missing keychain entries.
		}
	}

	return null;
}

async function getAnthropicCredentialFromAuthStorage(): Promise<LocalResolvedCredential | null> {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(ANTHROPIC_PROVIDER_ID);
		if (!isObjectRecord(credential)) return null;

		if (
			credential.type === "api_key" &&
			typeof credential.key === "string" &&
			credential.key.trim().length > 0
		) {
			return { kind: "api_key" };
		}

		if (credential.type === "oauth") {
			const expiresAt =
				typeof credential.expires === "number" ? credential.expires : undefined;
			if (typeof expiresAt === "number" && Date.now() >= expiresAt) {
				try {
					await authStorage.getApiKey(ANTHROPIC_PROVIDER_ID);
					authStorage.reload();
					const refreshed = authStorage.get(ANTHROPIC_PROVIDER_ID);
					if (
						isObjectRecord(refreshed) &&
						refreshed.type === "oauth" &&
						typeof refreshed.access === "string" &&
						refreshed.access.trim().length > 0
					) {
						return {
							kind: "oauth",
							expiresAt:
								typeof refreshed.expires === "number"
									? refreshed.expires
									: undefined,
						};
					}
					return { kind: "oauth", expiresAt };
				} catch {
					return { kind: "oauth", expiresAt };
				}
			}
			if (
				typeof credential.access === "string" &&
				credential.access.trim().length > 0
			) {
				return { kind: "oauth", expiresAt };
			}
		}
	} catch {
		// Ignore auth storage read failures for now.
	}

	return null;
}

export async function resolveAnthropicCredential(): Promise<LocalResolvedCredential | null> {
	return (
		getAnthropicCredentialFromConfig() ??
		getAnthropicCredentialFromKeychain() ??
		(await getAnthropicCredentialFromAuthStorage())
	);
}
