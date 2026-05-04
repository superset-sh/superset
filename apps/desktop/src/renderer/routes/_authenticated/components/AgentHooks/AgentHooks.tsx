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
	// Prefill v2 agent configs at startup so the Settings page (and any other
	// reader) sees them without a navigation-triggered fetch.
	useV2AgentConfigs();
	return null;
}
