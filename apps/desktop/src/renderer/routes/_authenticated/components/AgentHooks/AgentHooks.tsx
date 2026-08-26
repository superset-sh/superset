import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCliTerminalScriptImport } from "./hooks/useCliTerminalScriptImport";
import { useDefaultV2TerminalPresets } from "./hooks/useDefaultV2TerminalPresets";
import { usePlaceLocalWorktreesInSidebar } from "./hooks/usePlaceLocalWorktreesInSidebar";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 */
export function AgentHooks() {
	const { activeHostUrl, activeOrganizationId } = useLocalHostService();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultV2TerminalPresets(activeHostUrl);
	useCliTerminalScriptImport(activeOrganizationId);
	usePlaceLocalWorktreesInSidebar();
	return null;
}
