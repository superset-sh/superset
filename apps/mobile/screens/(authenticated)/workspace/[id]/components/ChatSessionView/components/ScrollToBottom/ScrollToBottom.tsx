import { useConversation } from "@/components/ai-elements/conversation";
import { ScrollToBottomButton } from "../../../ScrollToBottomButton";

export function ScrollToBottom({ inset }: { inset: number }) {
	const { isAtBottom, scrollToBottom } = useConversation();
	return (
		<ScrollToBottomButton
			bottomInset={inset}
			onPress={scrollToBottom}
			visible={!isAtBottom}
		/>
	);
}
