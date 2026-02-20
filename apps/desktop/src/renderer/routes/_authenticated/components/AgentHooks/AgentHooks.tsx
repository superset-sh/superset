import { useAgentManager } from "./hooks/useAgentManager";
import { useCommandWatcher } from "./hooks/useCommandWatcher";
import { useDevicePresence } from "./hooks/useDevicePresence";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 * useCommandWatcher uses useCollections which must be inside the provider.
 */
export function AgentHooks() {
	useDevicePresence();
	useCommandWatcher();
	useAgentManager();
	return null;
}
