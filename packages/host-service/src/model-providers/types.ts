import type { ModelProviderProtocol } from "../db/schema";

export type { ModelProviderProtocol };

export interface ModelProviderModelSummary {
	id: string;
	providerId: string;
	modelId: string;
	displayName: string;
	enabled: boolean;
	capabilities: Record<string, unknown>;
}

export interface ModelProviderSummary {
	id: string;
	name: string;
	protocol: ModelProviderProtocol;
	baseUrl: string;
	enabled: boolean;
	hasSecret: boolean;
	models: ModelProviderModelSummary[];
	createdAt: number;
	updatedAt: number;
}

export interface ProviderModelRef {
	providerId: string;
	modelId: string;
}

export interface WorkspaceClaudeModelConfig {
	workspaceId: string;
	providerId: string;
	haikuModelId: string;
	sonnetModelId: string;
	opusModelId: string;
	disableOneMillionContext: boolean;
	gatewayBaseUrl: string;
	settingsPath: string | null;
}
