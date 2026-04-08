import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useAgentHookListener } from "renderer/stores/tabs/useAgentHookListener";
import { useCommandWatcher } from "./hooks/useCommandWatcher";
import { useDefaultV2TerminalPresets } from "./hooks/useDefaultV2TerminalPresets";
import { useDevicePresence } from "./hooks/useDevicePresence";

/** Must be rendered inside CollectionsProvider — child hooks depend on useCollections. */
export function AgentHooks() {
	const { activeHostUrl } = useLocalHostService();
	useDevicePresence();
	useCommandWatcher();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultV2TerminalPresets(activeHostUrl);
	useAgentHookListener();
	return null;
}
