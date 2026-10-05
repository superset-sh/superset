import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl, PluginIcon } from "renderer/components/PluginIcon";
import { pluginMentionText } from "renderer/components/PluginMention";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";

export function usePluginMentionProvider(): ComposerMentionProvider {
	const { t } = useLingui();
	const pluginMentions = usePluginMentionOptions();
	const isDark = useIsDarkTheme();
	return useMemo(() => {
		const entries = pluginMentions.map(
			(plugin): ComposerMentionEntry => ({
				id: `plugin:${plugin.name}`,
				label: plugin.displayName,
				description: plugin.description,
				icon: (
					<PluginIcon className="size-4 rounded" pluginName={plugin.name} />
				),
				keywords: [plugin.name, plugin.description],
				select: (ctx) =>
					ctx.insertChip({
						label: plugin.displayName,
						serialized: pluginMentionText(plugin.name),
						iconUrl: getPluginIconUrl(plugin.name, isDark),
					}),
			}),
		);
		return {
			id: "plugins",
			title: t({ message: "Plugins" }),
			priority: 0,
			source: { kind: "static", load: () => entries },
		};
	}, [isDark, pluginMentions, t]);
}
