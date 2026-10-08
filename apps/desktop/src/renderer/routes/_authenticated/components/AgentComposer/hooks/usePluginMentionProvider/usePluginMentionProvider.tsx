import { useLingui } from "@lingui/react/macro";
import type {
	ComposerChip,
	ComposerChipMatch,
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl, PluginIcon } from "renderer/components/PluginIcon";
import {
	findPluginMentions,
	type PluginMentionOption,
	pluginMentionText,
} from "renderer/components/PluginMention";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";

export interface PluginMentionComposerProps {
	provider: ComposerMentionProvider;
	/** Chips for the `@name` handles a stored draft serialized them to. */
	findChips: (text: string) => ComposerChipMatch[];
}

export function usePluginMentionProvider(): PluginMentionComposerProps {
	const { t } = useLingui();
	const pluginMentions = usePluginMentionOptions();
	const isDark = useIsDarkTheme();
	return useMemo(() => {
		const toChip = (plugin: PluginMentionOption): ComposerChip => ({
			label: plugin.displayName,
			serialized: pluginMentionText(plugin.name),
			iconUrl: getPluginIconUrl(plugin.name, isDark),
		});
		const entries = pluginMentions.map(
			(plugin): ComposerMentionEntry => ({
				id: `plugin:${plugin.name}`,
				label: plugin.displayName,
				description: plugin.description,
				icon: (
					<PluginIcon className="size-4 rounded" pluginName={plugin.name} />
				),
				keywords: [plugin.name, plugin.description],
				select: (ctx) => ctx.insertChip(toChip(plugin)),
			}),
		);
		const resolvePlugin = (name: string) =>
			pluginMentions.find((plugin) => plugin.name === name) ?? null;
		return {
			provider: {
				id: "plugins",
				title: t({ message: "Plugins" }),
				priority: 0,
				source: { kind: "static", load: () => entries },
			},
			findChips: (text) =>
				findPluginMentions(text, resolvePlugin).map(
					({ start, end, plugin }) => ({ start, end, chip: toChip(plugin) }),
				),
		};
	}, [isDark, pluginMentions, t]);
}
