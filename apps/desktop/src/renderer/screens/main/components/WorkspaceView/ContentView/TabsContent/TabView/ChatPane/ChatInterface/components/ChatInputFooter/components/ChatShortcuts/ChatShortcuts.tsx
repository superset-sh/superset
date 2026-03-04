import { usePromptInputAttachments } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useAppHotkey } from "renderer/stores/hotkeys";

interface ChatShortcutsProps {
	isFocused: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
	inputRootRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatShortcuts({
	isFocused,
	setIssueLinkOpen,
	inputRootRef,
}: ChatShortcutsProps) {
	const attachments = usePromptInputAttachments();

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
			const textarea = inputRootRef.current?.querySelector<HTMLTextAreaElement>(
				"[data-slot=input-group-control]",
			);
			textarea?.focus();
		},
		{ enabled: isFocused, preventDefault: true },
	);

	return null;
}
