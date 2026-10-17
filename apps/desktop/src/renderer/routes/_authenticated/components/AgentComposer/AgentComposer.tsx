import type {
	ComposerChipMatch,
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputProps,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { useCallback, useMemo } from "react";
import { useComposerDictation } from "./hooks/useComposerDictation";
import { usePluginMentionProvider } from "./hooks/usePluginMentionProvider";

const NO_COMMANDS: PromptInputCommand[] = [];
const NO_PROVIDERS: ComposerMentionProvider[] = [];

export type AgentComposerProps = Omit<
	PromptInputProps,
	"mentionProviders" | "commands" | "findChips"
> & {
	mentionProviders?: ComposerMentionProvider[];
	commands?: PromptInputCommand[];
	findChips?: (text: string) => ComposerChipMatch[];
};

export function AgentComposer({
	commands = NO_COMMANDS,
	mentionProviders = NO_PROVIDERS,
	dictation,
	findChips: findMoreChips,
	...props
}: AgentComposerProps) {
	const { provider: pluginProvider, findChips: findPluginChips } =
		usePluginMentionProvider();
	const findChips = useCallback(
		(text: string) => {
			const matches = [
				...findPluginChips(text),
				...(findMoreChips?.(text) ?? []),
			].sort((a, b) => a.start - b.start);
			let end = 0;
			return matches.filter((match) => {
				if (match.start < end) return false;
				end = match.end;
				return true;
			});
		},
		[findPluginChips, findMoreChips],
	);
	const composerDictation = useComposerDictation();
	const providers = useMemo(
		() => [pluginProvider, ...mentionProviders],
		[pluginProvider, mentionProviders],
	);
	return (
		<PromptInput
			{...props}
			commands={commands}
			dictation={dictation ?? composerDictation}
			findChips={findChips}
			mentionProviders={providers}
		/>
	);
}
