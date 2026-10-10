import { useEffect, useRef } from "react";
import { useConversation } from "@/components/ai-elements/conversation";

export function StickToBottom({ inset }: { inset: number }) {
	const { isAtBottom, scrollToBottom } = useConversation();
	const previous = useRef(inset);
	useEffect(() => {
		const grew = inset > previous.current;
		previous.current = inset;
		if (grew && isAtBottom) scrollToBottom();
	}, [inset, isAtBottom, scrollToBottom]);
	return null;
}
