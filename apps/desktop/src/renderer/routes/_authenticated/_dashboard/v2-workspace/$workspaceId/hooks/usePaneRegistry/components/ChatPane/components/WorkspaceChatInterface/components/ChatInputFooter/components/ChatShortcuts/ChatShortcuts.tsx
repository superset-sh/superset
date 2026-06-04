import {
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { useHotkey } from "renderer/hotkeys";

interface ChatShortcutsProps {
	isFocused: boolean;
}

export function ChatShortcuts({ isFocused }: ChatShortcutsProps) {
	const attachments = usePromptInputAttachments();
	const { textInput } = usePromptInputController();

	useHotkey(
		"CHAT_ADD_ATTACHMENT",
		() => {
			attachments.openFileDialog();
		},
		{ enabled: isFocused, preventDefault: true },
	);

	useHotkey(
		"FOCUS_CHAT_INPUT",
		() => {
			textInput.focus();
		},
		{ enabled: isFocused, preventDefault: true },
	);

	return null;
}
