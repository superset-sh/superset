import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { useEffect } from "react";

export function useFocusPromptOnPane(isFocused: boolean) {
	const { textInput } = usePromptInputController();
	const focusPrompt = textInput.focus;

	useEffect(() => {
		if (isFocused) {
			focusPrompt();
		}
	}, [focusPrompt, isFocused]);
}
