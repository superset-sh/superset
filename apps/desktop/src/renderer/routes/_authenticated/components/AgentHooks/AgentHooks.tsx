import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useCommandWatcher } from "./hooks/useCommandWatcher";
import { useDevicePresence } from "./hooks/useDevicePresence";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 * useCommandWatcher uses useCollections which must be inside the provider.
 */
export function AgentHooks() {
	useDevicePresence();
	useCommandWatcher();
	// Warm v2 agent cache so Settings doesn't refetch on first navigation.
	useV2AgentConfigs();
	return null;
}
