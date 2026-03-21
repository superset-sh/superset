import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useEffect, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";

interface DraftSaverProps {
	paneId: string;
	sessionId: string | null;
	isSendingRef: React.RefObject<boolean>;
}

/**
 * Saves the current chat textarea draft to the tabs store on unmount.
 * Must be rendered inside <PromptInputProvider> to access the text input context.
 *
 * Uses refs for all mutable values so the unmount cleanup always reads the latest
 * state without re-registering the effect on every render.
 */
export function DraftSaver({
	paneId,
	sessionId,
	isSendingRef,
}: DraftSaverProps) {
	const { textInput, attachments } = usePromptInputController();
	const textRef = useRef(textInput.value);
	const paneIdRef = useRef(paneId);
	const previousSessionIdRef = useRef(sessionId);

	// Synchronous ref updates so the unmount cleanup always reads the latest values
	textRef.current = textInput.value;
	paneIdRef.current = paneId;
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
			const id = paneIdRef.current;
			const draft = textRef.current;
			const { panes, setChatLaunchConfig } = useTabsStore.getState();
			const currentConfig = panes[id]?.chat?.launchConfig ?? null;
			setChatLaunchConfig(id, {
				...currentConfig,
				draftInput: draft || undefined,
			});
		};
	}, [isSendingRef]);

	return null;
}
