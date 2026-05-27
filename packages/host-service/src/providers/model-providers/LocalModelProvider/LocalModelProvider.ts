import type { ModelProviderRuntimeResolver } from "../types";
import {
	buildAnthropicRuntimeEnv,
	getAnthropicEnvConfig,
	stripAnthropicCredentialEnvVariables,
} from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";
import {
	hasUsableCredential,
	resolveAnthropicCredential,
	resolveOpenAICredential,
} from "./utils";

const CLEANUP_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
	"OPENAI_BASE_URL",
	"KIMI_API_KEY",
	"KIMI_BASE_URL",
	"KIMI_API_BASE_URL",
	"MOONSHOT_API_KEY",
	"MOONSHOT_BASE_URL",
] as const;

const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";

interface LocalModelProviderOptions {
	anthropicEnvConfigPath?: string;
}

function trimEnvValue(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function normalizeBaseUrl(value: string | null): string {
	if (!value) return DEFAULT_KIMI_BASE_URL;
	try {
		return new URL(value).toString().replace(/\/$/, "");
	} catch {
		return value;
	}
}

function buildOpenAICompatibleRuntimeEnv(
	sourceEnv: Record<string, string | undefined>,
): Record<string, string> {
	const directOpenAIEnv = {
		OPENAI_API_KEY: trimEnvValue(sourceEnv.OPENAI_API_KEY),
		OPENAI_AUTH_TOKEN: trimEnvValue(sourceEnv.OPENAI_AUTH_TOKEN),
		OPENAI_BASE_URL: trimEnvValue(sourceEnv.OPENAI_BASE_URL),
	};
	const hasDirectOpenAIAuth = Boolean(
		directOpenAIEnv.OPENAI_API_KEY || directOpenAIEnv.OPENAI_AUTH_TOKEN,
	);

	const runtimeEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(directOpenAIEnv)) {
		if (value) runtimeEnv[key] = value;
	}

	if (hasDirectOpenAIAuth) return runtimeEnv;

	const kimiApiKey =
		trimEnvValue(sourceEnv.KIMI_API_KEY) ??
		trimEnvValue(sourceEnv.MOONSHOT_API_KEY);
	if (!kimiApiKey) return runtimeEnv;

	runtimeEnv.OPENAI_API_KEY = kimiApiKey;
	runtimeEnv.OPENAI_BASE_URL = normalizeBaseUrl(
		trimEnvValue(sourceEnv.KIMI_BASE_URL) ??
			trimEnvValue(sourceEnv.KIMI_API_BASE_URL) ??
			trimEnvValue(sourceEnv.MOONSHOT_BASE_URL),
	);
	return runtimeEnv;
}

export class LocalModelProvider implements ModelProviderRuntimeResolver {
	private readonly anthropicEnvConfigPath?: string;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: LocalModelProviderOptions) {
		this.anthropicEnvConfigPath = options?.anthropicEnvConfigPath;
	}

	private async resolveRuntimeEnv(): Promise<{
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	}> {
		const anthropicCredential = await resolveAnthropicCredential();
		const openaiCredential = resolveOpenAICredential();
		const anthropicEnvConfig = getAnthropicEnvConfig({
			configPath: this.anthropicEnvConfigPath,
		});
		const openAICompatibleRuntimeEnv = buildOpenAICompatibleRuntimeEnv(
			process.env as Record<string, string | undefined>,
		);
		const anthropicRuntimeEnv = buildAnthropicRuntimeEnv(
			stripAnthropicCredentialEnvVariables(anthropicEnvConfig.variables),
		);
		const runtimeEnv = {
			...openAICompatibleRuntimeEnv,
			...anthropicRuntimeEnv,
		};

		return {
			env: runtimeEnv,
			cleanupKeys: [...CLEANUP_KEYS],
			hasUsableRuntimeEnv:
				hasUsableCredential(anthropicCredential) ||
				hasUsableCredential(openaiCredential) ||
				Boolean(
					openAICompatibleRuntimeEnv.OPENAI_API_KEY ||
						openAICompatibleRuntimeEnv.OPENAI_AUTH_TOKEN,
				),
		};
	}

	async hasUsableRuntimeEnv(): Promise<boolean> {
		return (await this.resolveRuntimeEnv()).hasUsableRuntimeEnv;
	}

	async prepareRuntimeEnv(): Promise<void> {
		const runtimeEnv = await this.resolveRuntimeEnv();
		this.currentRuntimeEnv = applyRuntimeEnv(
			runtimeEnv.env,
			runtimeEnv.cleanupKeys,
			this.currentRuntimeEnv,
		);
	}
}
