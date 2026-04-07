import {
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useHotkey } from "renderer/hotkeys";

interface ChatShortcutsProps {
	isFocused: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ChatShortcuts({
	isFocused,
	setIssueLinkOpen,
}: ChatShortcutsProps) {
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
		"CHAT_LINK_ISSUE",
		() => {
			setIssueLinkOpen((prev) => !prev);
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
