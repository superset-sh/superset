import type { HostDb } from "../../../db";
import { decodeProviderModelRef } from "../../../model-providers/model-ref";
import { listModelProviders } from "../../../model-providers/storage";
import type { ModelProviderRuntimeResolver } from "../types";
import { applyRuntimeEnv } from "../utils/runtime-env";

const GATEWAY_RUNTIME_KEYS = [
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"OPENAI_AUTH_TOKEN",
] as const;

interface RegistryModelProviderOptions {
	db: HostDb;
	gatewayBaseUrl: string;
	internalToken?: string;
	fallback: ModelProviderRuntimeResolver;
}

export class RegistryModelProvider implements ModelProviderRuntimeResolver {
	private readonly db: HostDb;
	private readonly gatewayBaseUrl: string;
	private readonly internalToken: string | undefined;
	private readonly fallback: ModelProviderRuntimeResolver;
	private currentRuntimeEnv: Record<string, string> = {};

	constructor(options: RegistryModelProviderOptions) {
		this.db = options.db;
		this.gatewayBaseUrl = options.gatewayBaseUrl.replace(/\/+$/, "");
		this.internalToken = options.internalToken;
		this.fallback = options.fallback;
	}

	private hasRegistryProvider(): boolean {
		return listModelProviders(this.db).some(
			(provider) => provider.enabled && provider.hasSecret,
		);
	}

	async hasUsableRuntimeEnv(): Promise<boolean> {
		if (this.hasRegistryProvider() && this.internalToken) return true;
		return this.fallback.hasUsableRuntimeEnv();
	}

	async prepareRuntimeEnv(): Promise<void> {
		if (!this.hasRegistryProvider() || !this.internalToken) {
			await this.fallback.prepareRuntimeEnv();
			return;
		}
		this.currentRuntimeEnv = applyRuntimeEnv(
			{
				ANTHROPIC_API_KEY: this.internalToken,
				ANTHROPIC_AUTH_TOKEN: this.internalToken,
				ANTHROPIC_BASE_URL: this.gatewayBaseUrl,
			},
			[...GATEWAY_RUNTIME_KEYS],
			this.currentRuntimeEnv,
		);
	}

	async prepareRuntimeEnvForModel(input: {
		modelId: string;
		workspaceId: string;
	}): Promise<{ modelId: string }> {
		if (!decodeProviderModelRef(input.modelId)) {
			const resolved = await this.fallback.prepareRuntimeEnvForModel?.(input);
			if (resolved) return resolved;
			return { modelId: input.modelId };
		}

		await this.prepareRuntimeEnv();
		return { modelId: input.modelId };
	}
}
