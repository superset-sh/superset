import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCommandWatcher } from "./hooks/useCommandWatcher";
import { useDefaultV2TerminalPresets } from "./hooks/useDefaultV2TerminalPresets";
import { useDevicePresence } from "./hooks/useDevicePresence";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 * useCommandWatcher uses useCollections which must be inside the provider.
 */
export function AgentHooks() {
	const { activeHostUrl } = useLocalHostService();
	useDevicePresence();
	useCommandWatcher();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultV2TerminalPresets(activeHostUrl);
	return null;
}
