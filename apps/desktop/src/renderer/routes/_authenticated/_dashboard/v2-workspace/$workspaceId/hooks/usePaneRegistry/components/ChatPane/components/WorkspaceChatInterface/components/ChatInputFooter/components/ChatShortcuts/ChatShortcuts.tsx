import {
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useAppHotkey } from "renderer/stores/hotkeys";

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

	useAppHotkey(
		"CHAT_ADD_ATTACHMENT",
		() => {
			attachments.openFileDialog();
		},
		{ enabled: isFocused, preventDefault: true },
	);

	useAppHotkey(
		"CHAT_LINK_ISSUE",
		() => {
			setIssueLinkOpen((prev) => !prev);
		},
		{ enabled: isFocused, preventDefault: true },
	);

	useAppHotkey(
		"FOCUS_CHAT_INPUT",
		() => {
			textInput.focus();
		},
		{ enabled: isFocused, preventDefault: true },
	);

	return null;
}
