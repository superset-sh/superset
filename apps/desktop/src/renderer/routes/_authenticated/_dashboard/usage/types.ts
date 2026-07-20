import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";

export type ProviderSnapshot =
	ElectronRouterOutputs["usage"]["getSnapshot"][number];
export type RateLimitWindow = ProviderSnapshot["windows"][number];
export type CostStatsData = NonNullable<ProviderSnapshot["cost"]>;
export type UsageDisplaySettings =
	ElectronRouterOutputs["usage"]["getSettings"];
export type ProviderId = ProviderSnapshot["providerId"];
