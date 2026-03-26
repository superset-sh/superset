import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import { useEffect } from "react";

export function useFocusPromptOnPane(isFocused: boolean) {
	const { textInput } = usePromptInputController();

	useEffect(() => {
		if (isFocused) {
			textInput.focus();
		}
	}, [isFocused, textInput]);
}
