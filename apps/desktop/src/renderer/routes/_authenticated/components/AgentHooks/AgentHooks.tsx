import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCommandWatcher } from "./hooks/useCommandWatcher";
import { useDevicePresence } from "./hooks/useDevicePresence";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 * useCommandWatcher uses useCollections which must be inside the provider.
 */
export function AgentHooks() {
	const { activeHostUrl } = useLocalHostService();
	useDevicePresence();
	useCommandWatcher();
	// Warm v2 agent cache for the local host so Settings doesn't refetch on
	// first navigation. Remote-host caches populate lazily when the modal
	// targets a different device.
	useV2AgentConfigs(activeHostUrl);
	return null;
}
