export interface ModelProviderRuntimeResolver {
	hasUsableRuntimeEnv(): Promise<boolean>;
	prepareRuntimeEnv(): Promise<void>;
}
