import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useEffect, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";

interface DraftSaverProps {
	paneId: string;
	isSendingRef: React.RefObject<boolean>;
}

/**
 * Saves the current chat textarea draft to the tabs store on unmount.
 * Must be rendered inside <PromptInputProvider> to access the text input context.
 *
 * Uses refs for all mutable values so the unmount cleanup always reads the latest
 * state without re-registering the effect on every render.
 */
export function DraftSaver({ paneId, isSendingRef }: DraftSaverProps) {
	const { textInput } = usePromptInputController();
	const textRef = useRef(textInput.value);
	const paneIdRef = useRef(paneId);

	useEffect(() => {
		textRef.current = textInput.value;
	}, [textInput.value]);

	useEffect(() => {
		paneIdRef.current = paneId;
	}, [paneId]);

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
