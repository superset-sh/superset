import { useMemo } from "react";
import type { PluginMentionOption } from "renderer/components/PluginMention";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";

/** Installed, enabled plugins: the ones whose tools an agent can actually reach. */
export function usePluginMentionOptions(): PluginMentionOption[] {
	const { plugins } = usePluginCatalog();
	return useMemo(
		() =>
			plugins
				.filter((plugin) => plugin.installed && plugin.enabled)
				.map((plugin) => ({
					name: plugin.name,
					displayName: plugin.interface.displayName,
					description: plugin.description,
				})),
		[plugins],
	);
}
