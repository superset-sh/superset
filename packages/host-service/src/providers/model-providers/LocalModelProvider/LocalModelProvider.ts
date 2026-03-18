import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createAuthStorage } from "mastracode";
import type { ModelProviderRuntimeResolver } from "../types";
import {
	buildAnthropicRuntimeEnv,
	getAnthropicEnvConfig,
	stripAnthropicCredentialEnvVariables,
} from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";

const ANTHROPIC_PROVIDER_ID = "anthropic";
const OPENAI_PROVIDER_IDS = ["openai-codex", "openai"] as const;
const CLEANUP_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

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

interface LocalModelProviderOptions {
	anthropicEnvConfigPath?: string;
}

interface LocalResolvedCredential {
	kind: "api_key" | "oauth";
	expiresAt?: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isExpiredOauth(expiresAt: number | undefined): boolean {
	return typeof expiresAt === "number" && Date.now() >= expiresAt;
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

function getAnthropicCredentialFromAuthStorage(): LocalResolvedCredential | null {
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

		if (
			credential.type === "oauth" &&
			typeof credential.access === "string" &&
			credential.access.trim().length > 0
		) {
			return {
				kind: "oauth",
				expiresAt:
					typeof credential.expires === "number"
						? credential.expires
						: undefined,
			};
		}
	} catch {
		// Ignore auth storage read failures for now.
	}

	return null;
}

function getOpenAICredentialFromAuthStorage(): LocalResolvedCredential | null {
	try {
		const authStorage = createAuthStorage();
		authStorage.reload();
		const credentials: LocalResolvedCredential[] = [];

		for (const providerId of OPENAI_PROVIDER_IDS) {
			const credential = authStorage.get(providerId);
			if (!isObjectRecord(credential)) continue;

			if (
				credential.type === "api_key" &&
				typeof credential.key === "string" &&
				credential.key.trim().length > 0
			) {
				credentials.push({ kind: "api_key" });
				continue;
			}

			if (
				credential.type === "oauth" &&
				typeof credential.access === "string" &&
				credential.access.trim().length > 0
			) {
				credentials.push({
					kind: "oauth",
					expiresAt:
						typeof credential.expires === "number"
							? credential.expires
							: undefined,
				});
			}
		}

		return (
			credentials.find(
				(credential) =>
					credential.kind !== "oauth" || !isExpiredOauth(credential.expiresAt),
			) ??
			credentials[0] ??
			null
		);
	} catch {
		return null;
	}
}

function hasUsableCredential(credential: LocalResolvedCredential | null): boolean {
	if (!credential) return false;
	return credential.kind !== "oauth" || !isExpiredOauth(credential.expiresAt);
}

export class LocalModelProvider implements ModelProviderRuntimeResolver {
	private readonly anthropicEnvConfigPath?: string;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: LocalModelProviderOptions) {
		this.anthropicEnvConfigPath = options?.anthropicEnvConfigPath;
	}

	private resolveRuntimeEnv(): {
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	} {
		const anthropicCredential =
			getAnthropicCredentialFromConfig() ??
			getAnthropicCredentialFromKeychain() ??
			getAnthropicCredentialFromAuthStorage();
		const openaiCredential = getOpenAICredentialFromAuthStorage();
		const anthropicEnvConfig = getAnthropicEnvConfig({
			configPath: this.anthropicEnvConfigPath,
		});
		const runtimeEnv = buildAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(anthropicEnvConfig.variables),
		);

		return {
			env: runtimeEnv,
			cleanupKeys: [...CLEANUP_KEYS],
			hasUsableRuntimeEnv:
				hasUsableCredential(anthropicCredential) ||
				hasUsableCredential(openaiCredential),
		};
	}

	async hasUsableRuntimeEnv(): Promise<boolean> {
		return this.resolveRuntimeEnv().hasUsableRuntimeEnv;
	}

	async prepareRuntimeEnv(): Promise<void> {
		const runtimeEnv = this.resolveRuntimeEnv();
		this.currentRuntimeEnv = applyRuntimeEnv(
			runtimeEnv.env,
			runtimeEnv.cleanupKeys,
			this.currentRuntimeEnv,
		);
	}
}
