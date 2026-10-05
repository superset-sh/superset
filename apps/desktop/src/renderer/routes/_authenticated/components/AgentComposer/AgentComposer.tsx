import type {
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputProps,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { usePluginMentionProvider } from "./hooks/usePluginMentionProvider";

const NO_COMMANDS: PromptInputCommand[] = [];
const NO_PROVIDERS: ComposerMentionProvider[] = [];

export type AgentComposerProps = Omit<
	PromptInputProps,
	"mentionProviders" | "commands"
> & {
	mentionProviders?: ComposerMentionProvider[];
	commands?: PromptInputCommand[];
};

export function AgentComposer({
	commands = NO_COMMANDS,
	mentionProviders = NO_PROVIDERS,
	...props
}: AgentComposerProps) {
	const pluginProvider = usePluginMentionProvider();
	const providers = useMemo(
		() => [pluginProvider, ...mentionProviders],
		[pluginProvider, mentionProviders],
	);
	return (
		<PromptInput {...props} commands={commands} mentionProviders={providers} />
	);
}
