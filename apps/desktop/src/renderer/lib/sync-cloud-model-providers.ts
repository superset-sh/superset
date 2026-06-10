import { apiTrpcClient } from "./api-trpc-client";
import { getHostServiceClientByUrl } from "./host-service-client";

const inFlightSyncs = new Map<string, Promise<void>>();

export async function syncCloudModelProvidersToHost(
	hostUrl: string | null | undefined,
): Promise<void> {
	if (!hostUrl) return;
	const existing = inFlightSyncs.get(hostUrl);
	if (existing) return existing;

	const sync = (async () => {
		const providers = await apiTrpcClient.modelProvider.syncPayload.query();
		await getHostServiceClientByUrl(
			hostUrl,
		).modelProviders.syncFromCloud.mutate({
			providers: providers.map((provider) => ({
				id: provider.id,
				name: provider.name,
				protocol: provider.protocol,
				baseUrl: provider.baseUrl,
				enabled: provider.enabled,
				secret: provider.secret,
				models: provider.models.map((model) => ({
					modelId: model.modelId,
					displayName: model.displayName,
					enabled: model.enabled,
					capabilities: model.capabilities,
				})),
			})),
		});
	})().finally(() => {
		inFlightSyncs.delete(hostUrl);
	});

	inFlightSyncs.set(hostUrl, sync);
	return sync;
}
