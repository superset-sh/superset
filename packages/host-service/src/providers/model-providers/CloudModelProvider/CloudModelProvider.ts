import type { ModelProviderRuntimeResolver } from "../types";
import { buildAnthropicRuntimeEnv } from "../utils/anthropic-runtime-env";
import { applyRuntimeEnv } from "../utils/runtime-env";

const CLOUD_PROVIDER_ENV_KEYS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
	"OPENAI_BASE_URL",
	"CLAUDE_CODE_USE_BEDROCK",
	"AWS_REGION",
	"AWS_DEFAULT_REGION",
	"AWS_PROFILE",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
] as const;

interface CloudModelProviderOptions {
	envResolver?: () => Promise<Record<string, string | undefined>>;
}

function trimEnvValue(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export class CloudModelProvider implements ModelProviderRuntimeResolver {
	private readonly envResolver: () => Promise<
		Record<string, string | undefined>
	>;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options?: CloudModelProviderOptions) {
		this.envResolver =
			options?.envResolver ??
			(async () => process.env as Record<string, string | undefined>);
	}

	private async resolveRuntimeEnv(): Promise<{
		env: Record<string, string>;
		cleanupKeys: string[];
		hasUsableRuntimeEnv: boolean;
	}> {
		const sourceEnv = await this.envResolver();
		const nextEnv: Record<string, string> = {};

		for (const key of CLOUD_PROVIDER_ENV_KEYS) {
			const value = trimEnvValue(sourceEnv[key]);
			if (!value) continue;
			nextEnv[key] = value;
		}

		const anthropicEnv = buildAnthropicRuntimeEnv({
			ANTHROPIC_API_KEY: nextEnv.ANTHROPIC_API_KEY ?? "",
			ANTHROPIC_AUTH_TOKEN: nextEnv.ANTHROPIC_AUTH_TOKEN ?? "",
			ANTHROPIC_BASE_URL: nextEnv.ANTHROPIC_BASE_URL ?? "",
		});

		const env = {
			...nextEnv,
			...Object.fromEntries(
				Object.entries(anthropicEnv).filter(([, value]) => value.length > 0),
			),
		};

		return {
			env,
			cleanupKeys: [...CLOUD_PROVIDER_ENV_KEYS],
			hasUsableRuntimeEnv: Boolean(
				env.ANTHROPIC_API_KEY ||
					env.ANTHROPIC_AUTH_TOKEN ||
					env.OPENAI_API_KEY ||
					env.OPENAI_AUTH_TOKEN,
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
