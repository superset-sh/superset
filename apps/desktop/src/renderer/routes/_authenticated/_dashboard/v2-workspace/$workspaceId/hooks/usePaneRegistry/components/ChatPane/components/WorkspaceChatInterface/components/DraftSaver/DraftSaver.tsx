import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useEffect, useRef } from "react";

interface DraftSaverProps {
	sessionId: string | null;
	isSendingRef: React.RefObject<boolean>;
	onSaveDraft: (draft: string | undefined) => void;
}

/**
 * Saves the current chat textarea draft to the owning pane's persisted data on
 * unmount, so switching tabs/panes away and back preserves what the user typed.
 * Must be rendered inside <PromptInputProvider> to access the text input context.
 *
 * Uses refs for all mutable values so the unmount cleanup always reads the latest
 * state (and latest `onSaveDraft` closure) without re-registering the effect on
 * every render.
 */
export function DraftSaver({
	sessionId,
	isSendingRef,
	onSaveDraft,
}: DraftSaverProps) {
	const { textInput, attachments } = usePromptInputController();
	const textRef = useRef(textInput.value);
	const onSaveDraftRef = useRef(onSaveDraft);
	const previousSessionIdRef = useRef(sessionId);

	// Synchronous ref updates so the unmount cleanup always reads the latest values
	textRef.current = textInput.value;
	onSaveDraftRef.current = onSaveDraft;
	if (isSendingRef.current && textInput.value.length === 0) {
		isSendingRef.current = false;
	}

	useEffect(() => {
		if (sessionId === previousSessionIdRef.current) return;
		previousSessionIdRef.current = sessionId;
		textInput.clear();
		attachments.clear();
	}, [attachments.clear, sessionId, textInput.clear]);

	useEffect(() => {
		return () => {
			if (isSendingRef.current) return;
			onSaveDraftRef.current(textRef.current || undefined);
		};
	}, [isSendingRef]);

	return null;
}
