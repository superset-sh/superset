export interface ModelProviderRuntimeResolver {
	hasUsableRuntimeEnv(): Promise<boolean>;
	prepareRuntimeEnv(): Promise<void>;
	prepareRuntimeEnvForModel?(input: {
		modelId: string;
		workspaceId: string;
	}): Promise<{ modelId: string }>;
}
