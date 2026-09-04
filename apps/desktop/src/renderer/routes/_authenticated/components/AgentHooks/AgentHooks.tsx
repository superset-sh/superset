import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCliTerminalScriptImport } from "./hooks/useCliTerminalScriptImport";
import { useDefaultV2TerminalPresets } from "./hooks/useDefaultV2TerminalPresets";
import { usePlaceWorktreesInSidebar } from "./hooks/usePlaceWorktreesInSidebar";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 */
export function AgentHooks() {
	const { activeHostUrl, activeOrganizationId } = useLocalHostService();
	// Seeds the default v2 terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultV2TerminalPresets(activeHostUrl);
	useCliTerminalScriptImport(activeOrganizationId);
	usePlaceWorktreesInSidebar();
	return null;
}
