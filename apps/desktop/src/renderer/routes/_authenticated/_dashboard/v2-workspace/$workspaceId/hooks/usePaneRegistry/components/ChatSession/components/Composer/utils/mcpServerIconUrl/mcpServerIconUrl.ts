import type { McpServerEntry } from "@superset/shared/mcp-servers";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl } from "renderer/components/PluginIcon";

export function mcpServerIconUrl(
	server: Pick<McpServerEntry, "agent" | "plugin">,
	isDark: boolean,
): string | undefined {
	return server.plugin
		? getPluginIconUrl(server.plugin.name, isDark)
		: getPresetIcon(server.agent, isDark);
}
