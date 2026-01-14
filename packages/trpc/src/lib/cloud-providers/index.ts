import type { CloudProviderType } from "@superset/db/schema";
import { FreestyleProvider } from "./freestyle-provider";
import type { CloudProviderInterface } from "./types";

/**
 * Get a cloud provider instance by type
 */
export function getCloudProvider(type: CloudProviderType): CloudProviderInterface {
	switch (type) {
		case "freestyle":
			return new FreestyleProvider();
		case "fly":
			throw new Error("Fly provider not yet implemented");
		default:
			throw new Error(`Unknown cloud provider: ${type}`);
	}
}

export * from "./types";
export { FreestyleProvider } from "./freestyle-provider";
