import { PROVIDER_REGISTRY } from "@superset/agent";

interface ProviderFilter {
	displayName?: string;
	modelFilter?: (modelId: string) => boolean;
}

const ALLOWED_PROVIDERS: Record<string, ProviderFilter> = {
	anthropic: {},
	openai: {
		displayName: "Codex",
		modelFilter: (m) => m.includes("codex"),
	},
};

export function getAvailableModels() {
	return Object.entries(ALLOWED_PROVIDERS).flatMap(
		([providerId, filter]) => {
			const registry = (
				PROVIDER_REGISTRY as Record<
					string,
					{ name: string; models: string[] }
				>
			)[providerId];
			if (!registry) return [];

			const models = filter.modelFilter
				? registry.models.filter(filter.modelFilter)
				: registry.models;

			return models.map((modelId) => ({
				id: `${providerId}/${modelId}`,
				name: modelId,
				provider: filter.displayName ?? registry.name,
			}));
		},
	);
}
