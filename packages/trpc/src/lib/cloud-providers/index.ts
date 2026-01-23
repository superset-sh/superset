import type { CloudProviderType } from "@superset/db/schema";

import { FreestyleProvider } from "./freestyle-provider";
import type { CloudProviderInterface } from "./types";

// Cache provider instances to avoid recreating them
const providerCache = new Map<CloudProviderType, CloudProviderInterface>();

/**
 * Get a cloud provider instance by type.
 * Instances are cached for reuse.
 */
export function getCloudProvider(
	type: CloudProviderType,
): CloudProviderInterface {
	const cached = providerCache.get(type);
	if (cached) {
		return cached;
	}

	let provider: CloudProviderInterface;

	switch (type) {
		case "freestyle":
			provider = new FreestyleProvider();
			break;
		case "fly":
			throw new Error("Fly.io provider not yet implemented");
		default:
			throw new Error(`Unknown cloud provider: ${type}`);
	}

	providerCache.set(type, provider);
	return provider;
}

export { FreestyleProvider } from "./freestyle-provider";
export * from "./types";
