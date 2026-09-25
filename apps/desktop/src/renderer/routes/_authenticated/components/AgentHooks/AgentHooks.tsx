import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useCliTerminalScriptImport } from "./hooks/useCliTerminalScriptImport";
import { useDefaultTerminalPresets } from "./hooks/useDefaultTerminalPresets";
import { usePlaceProjectsInSidebar } from "./hooks/usePlaceProjectsInSidebar";
import { usePlaceWorktreesInSidebar } from "./hooks/usePlaceWorktreesInSidebar";

/**
 * Component that runs agent-related hooks requiring CollectionsProvider context.
 */
export function AgentHooks() {
	const { activeHostUrl, activeOrganizationId } = useLocalHostService();
	// Seeds the default terminal presets and warms the local host's agent
	// config cache for Settings.
	useDefaultTerminalPresets(activeHostUrl);
	useCliTerminalScriptImport(activeOrganizationId);
	usePlaceProjectsInSidebar();
	usePlaceWorktreesInSidebar();
	return null;
}
