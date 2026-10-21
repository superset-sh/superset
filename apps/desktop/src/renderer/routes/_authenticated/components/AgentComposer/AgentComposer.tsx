import type {
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputProps,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { useAttachmentPreview } from "./hooks/useAttachmentPreview";
import { useComposerDictation } from "./hooks/useComposerDictation";
import { usePageMentionProvider } from "./hooks/usePageMentionProvider";
import { usePluginMentionProvider } from "./hooks/usePluginMentionProvider";
import { useTrackerMentionProvider } from "./hooks/useTrackerMentionProvider";

const NO_COMMANDS: PromptInputCommand[] = [];
const NO_PROVIDERS: ComposerMentionProvider[] = [];

export type AgentComposerProps = Omit<
	PromptInputProps,
	"mentionProviders" | "commands" | "onAttachmentClick"
> & {
	mentionProviders?: ComposerMentionProvider[];
	commands?: PromptInputCommand[];
};

export function AgentComposer({
	commands = NO_COMMANDS,
	mentionProviders = NO_PROVIDERS,
	dictation,
	...props
}: AgentComposerProps) {
	const pluginProvider = usePluginMentionProvider();
	const pageProvider = usePageMentionProvider();
	const trackerProvider = useTrackerMentionProvider();
	const composerDictation = useComposerDictation();
	const attachmentPreview = useAttachmentPreview();
	const providers = useMemo(
		() => [
			pluginProvider,
			pageProvider,
			...(trackerProvider ? [trackerProvider] : []),
			...mentionProviders,
		],
		[pluginProvider, pageProvider, trackerProvider, mentionProviders],
	);
	return (
		<>
			<PromptInput
				{...props}
				commands={commands}
				dictation={dictation ?? composerDictation}
				mentionProviders={providers}
				onAttachmentClick={attachmentPreview.onAttachmentClick}
			/>
			{attachmentPreview.overlay}
		</>
	);
}
